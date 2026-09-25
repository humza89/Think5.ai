/**
 * GreenhouseAdapter (Phase 0 T15) — the first production implementation of
 * the T0.5 `ATSAdapter` contract, over the Greenhouse Harvest API v1.
 *
 * Narrow by design: enough to prove connect → import jobs → push candidate →
 * attach report → inbound webhook with idempotency, reconciliation and
 * rate-limit handling. Other ATSs are Phase 3.
 *
 * Idempotency: every write takes a caller key. Results are remembered in an
 * injectable `IdempotencyStore` (Prisma-backed in production via
 * `ATSEntityLink` rows of localType "idempotency"), so a retried job or a
 * replayed event never creates a second Greenhouse candidate or note.
 *
 * The HTTP layer is injectable (`fetch`) so the conformance and fixture tests
 * run without network; the nightly sandbox job uses the real one.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type {
  ATSAdapter,
  ATSCandidate,
  ATSCandidateInput,
  ATSCapabilities,
  ATSConnection,
  ATSConnectionConfig,
  ATSEvent,
  ATSEventType,
  ATSJob,
  ATSWebhookRequest,
  ATSWriteOptions,
  ATSWriteResult,
  InterviewReportAttachment,
} from "@/lib/contracts/ats";

export interface IdempotencyStore {
  get(key: string): Promise<ATSWriteResult | null>;
  set(key: string, result: ATSWriteResult): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, ATSWriteResult>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, result: ATSWriteResult) { this.map.set(key, result); }
}

export interface GreenhouseAdapterOptions {
  fetch?: typeof fetch;
  idempotency?: IdempotencyStore;
  /** Harvest user id sent as On-Behalf-Of for writes (required by Greenhouse for POSTs). */
  onBehalfOf?: string;
  baseUrl?: string;
  /** Max retries on 429/5xx (with Retry-After / exponential backoff). */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class GreenhouseRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Greenhouse rate limit exceeded; retry after ${retryAfterMs}ms`);
    this.name = "GreenhouseRateLimitError";
  }
}

export class GreenhouseApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: string) {
    super(message);
    this.name = "GreenhouseApiError";
  }
}

// Harvest API shapes we read (subset).
export interface HarvestJob {
  id: number;
  name: string;
  status: "open" | "closed" | "draft";
  updated_at: string;
  created_at?: string;
  departments?: Array<{ id: number; name: string }>;
  offices?: Array<{ id: number; name: string; location?: { name: string | null } }>;
  notes?: string | null;
}

export interface HarvestCandidate {
  id: number;
  first_name: string;
  last_name: string;
  updated_at?: string;
  email_addresses?: Array<{ value: string; type: string }>;
  applications?: Array<{ id: number; jobs: Array<{ id: number; name: string }>; current_stage?: { id: number; name: string } | null; status: string }>;
}

const DEFAULT_BASE = "https://harvest.greenhouse.io/v1";
const WEBHOOK_TYPES: Record<string, ATSEventType> = {
  candidate_stage_change: "candidate.stage_changed",
  candidate_updated: "candidate.updated",
  candidate_hired: "candidate.updated",
  candidate_unhired: "candidate.updated",
  application_updated: "candidate.updated",
  candidate_rejected: "application.rejected",
  job_updated: "job.updated",
  job_created: "job.updated",
  job_deleted: "job.updated",
};

export class GreenhouseAdapter implements ATSAdapter {
  readonly provider = "greenhouse" as const;
  private config: ATSConnectionConfig | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotency: IdempotencyStore;
  private readonly onBehalfOf?: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: GreenhouseAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.idempotency = options.idempotency ?? new InMemoryIdempotencyStore();
    this.onBehalfOf = options.onBehalfOf;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  private requireConnection(): ATSConnectionConfig {
    if (!this.config) throw new Error("GreenhouseAdapter is not connected; call connect() first");
    return this.config;
  }

  /** Authenticated Harvest request with 429/5xx backoff and typed errors. */
  private async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<{ body: T; headers: Headers }> {
    const config = this.requireConnection();
    const auth = Buffer.from(`${config.apiKey}:`).toString("base64");
    const headers: Record<string, string> = { Authorization: `Basic ${auth}`, Accept: "application/json" };
    if (init.body) headers["Content-Type"] = "application/json";
    if (this.onBehalfOf && init.method && init.method !== "GET") headers["On-Behalf-Of"] = this.onBehalfOf;
    const base = config.baseUrl ? config.baseUrl.replace(/\/$/, "") : this.baseUrl;
    const res = await this.fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 429 || res.status >= 500) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Math.max(0, Number(retryAfterHeader) * 1000 || 0) : Math.min(30_000, 500 * 2 ** attempt);
      if (attempt < this.maxRetries) {
        await this.sleep(retryAfterMs);
        return this.request<T>(path, init, attempt + 1);
      }
      if (res.status === 429) throw new GreenhouseRateLimitError(retryAfterMs);
      throw new GreenhouseApiError(res.status, `Greenhouse API error (${res.status})`, await res.text().catch(() => ""));
    }
    if (!res.ok) {
      throw new GreenhouseApiError(res.status, `Greenhouse API error (${res.status})`, await res.text().catch(() => ""));
    }
    const text = await res.text();
    return { body: (text ? JSON.parse(text) : null) as T, headers: res.headers };
  }

  async connect(config: ATSConnectionConfig): Promise<ATSConnection> {
    if (config.provider !== "greenhouse") return { connected: false, detail: `adapter is for greenhouse, got ${config.provider}` };
    if (!config.apiKey) return { connected: false, detail: "apiKey is required" };
    this.config = config;
    try {
      // Cheapest authenticated call; also proves the key has Harvest job scope.
      await this.request<HarvestJob[]>("/jobs?per_page=1");
      return { connected: true, accountName: `greenhouse:${config.tenantId}` };
    } catch (err) {
      this.config = null;
      // A rate limit is not an authentication verdict: let the caller retry later.
      if (err instanceof GreenhouseRateLimitError) throw err;
      return { connected: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async listJobs(since?: string): Promise<ATSJob[]> {
    this.requireConnection();
    const jobs: ATSJob[] = [];
    let page = 1;
    for (;;) {
      const qs = new URLSearchParams({ per_page: "100", page: String(page) });
      if (since) qs.set("updated_after", since);
      const { body, headers } = await this.request<HarvestJob[]>(`/jobs?${qs.toString()}`);
      for (const job of body ?? []) jobs.push(toATSJob(job));
      const link = headers.get("link") ?? "";
      if (!/rel="next"/.test(link) || (body ?? []).length === 0) break;
      page++;
      if (page > 50) break; // safety
    }
    return jobs;
  }

  async getCandidate(id: string): Promise<ATSCandidate | null> {
    this.requireConnection();
    try {
      const { body } = await this.request<HarvestCandidate>(`/candidates/${encodeURIComponent(id)}`);
      return body ? toATSCandidate(body) : null;
    } catch (err) {
      if (err instanceof GreenhouseApiError && err.status === 404) return null;
      throw err;
    }
  }

  async upsertCandidate(candidate: ATSCandidateInput, options: ATSWriteOptions): Promise<ATSWriteResult> {
    this.requireConnection();
    if (!options?.idempotencyKey) throw new Error("upsertCandidate requires an idempotencyKey");
    const key = `upsert:${options.idempotencyKey}`;
    const replay = await this.idempotency.get(key);
    if (replay) return { ...replay, deduplicated: true };

    let result: ATSWriteResult;
    if (candidate.id) {
      await this.request<HarvestCandidate>(`/candidates/${encodeURIComponent(candidate.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ first_name: candidate.firstName, last_name: candidate.lastName, ...(candidate.email ? { email_addresses: [{ value: candidate.email, type: "personal" }] } : {}) }),
      });
      result = { id: candidate.id, created: false, idempotencyKey: options.idempotencyKey, deduplicated: false };
    } else {
      const { body } = await this.request<HarvestCandidate>("/candidates", {
        method: "POST",
        body: JSON.stringify({
          first_name: candidate.firstName,
          last_name: candidate.lastName,
          ...(candidate.email ? { email_addresses: [{ value: candidate.email, type: "personal" }] } : {}),
          applications: candidate.jobIds.map((jobId) => ({ job_id: Number(jobId) })),
        }),
      });
      result = { id: String(body.id), created: true, idempotencyKey: options.idempotencyKey, deduplicated: false };
    }
    await this.idempotency.set(key, result);
    return result;
  }

  async attachInterviewReport(candidateId: string, report: InterviewReportAttachment, options: ATSWriteOptions): Promise<ATSWriteResult> {
    this.requireConnection();
    if (!options?.idempotencyKey) throw new Error("attachInterviewReport requires an idempotencyKey");
    const key = `report:${options.idempotencyKey}`;
    const replay = await this.idempotency.get(key);
    if (replay) return { ...replay, deduplicated: true };
    const note = formatReportNote(report);
    const { body } = await this.request<{ id?: number }>(`/candidates/${encodeURIComponent(candidateId)}/activity_feed/notes`, {
      method: "POST",
      body: JSON.stringify({ user_id: this.onBehalfOf ? Number(this.onBehalfOf) : undefined, body: note, visibility: "private" }),
    });
    const result: ATSWriteResult = { id: body?.id ? String(body.id) : `${candidateId}:${report.interviewId}`, created: true, idempotencyKey: options.idempotencyKey, deduplicated: false };
    await this.idempotency.set(key, result);
    return result;
  }

  /**
   * Greenhouse signs webhooks with HMAC-SHA256 of the raw body using the
   * secret key configured on the webhook; header `Signature: sha256 <hex>`.
   */
  async verifyWebhook(request: ATSWebhookRequest): Promise<boolean> {
    const secret = this.config?.webhookSecret;
    if (!secret) return false;
    const header = headerValue(request.headers, "signature") ?? headerValue(request.headers, "x-greenhouse-signature");
    if (!header) return false;
    const provided = header.replace(/^sha256[=\s]+/i, "").trim();
    const expected = createHmac("sha256", secret).update(request.rawBody).digest("hex");
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  }

  parseWebhook(body: string): ATSEvent[] {
    let parsed: { action?: string; payload?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }
    if (!parsed?.action) return [];
    const type = WEBHOOK_TYPES[parsed.action] ?? "candidate.updated";
    const payload = parsed.payload ?? {};
    const application = payload.application as { id?: number; updated_at?: string; candidate?: { id?: number } } | undefined;
    const job = payload.job as { id?: number; updated_at?: string } | undefined;
    const candidate = payload.candidate as { id?: number; updated_at?: string } | undefined;
    const occurredAt = application?.updated_at ?? job?.updated_at ?? candidate?.updated_at ?? new Date(this.now()).toISOString();
    // Greenhouse sends no event id; a body digest gives a stable one for deduplication.
    const providerEventId = `gh-${createHash("sha256").update(body).digest("hex").slice(0, 24)}`;
    return [{ type, providerEventId, occurredAt: new Date(occurredAt).toISOString(), payload: { action: parsed.action, ...payload } }];
  }

  capabilities(): ATSCapabilities {
    return { listJobs: true, getCandidate: true, upsertCandidate: true, attachInterviewReport: true, webhooks: true, advanceStage: true, reject: true };
  }
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === lower) return value;
  return undefined;
}

export function toATSJob(job: HarvestJob): ATSJob {
  return { id: String(job.id), title: job.name, status: job.status === "open" ? "open" : job.status === "draft" ? "draft" : "closed", updatedAt: new Date(job.updated_at).toISOString() };
}

export function toATSCandidate(c: HarvestCandidate): ATSCandidate {
  const email = c.email_addresses?.find((e) => e.type === "work")?.value ?? c.email_addresses?.[0]?.value;
  const jobIds = [...new Set((c.applications ?? []).flatMap((a) => a.jobs.map((j) => String(j.id))))];
  const stage = c.applications?.[0]?.current_stage?.name ?? undefined;
  return { id: String(c.id), firstName: c.first_name, lastName: c.last_name, email, jobIds, stage, externalUrl: `https://app.greenhouse.io/people/${c.id}` };
}

export function formatReportNote(report: InterviewReportAttachment): string {
  const lines = [`## Think5 AI interview report`, ``];
  if (report.overallScore !== undefined) lines.push(`**Overall score:** ${report.overallScore}/100`);
  if (report.recommendation) lines.push(`**Recommendation:** ${report.recommendation}`);
  lines.push(``, report.summary.trim());
  if (report.reportUrl) lines.push(``, `[View full report](${report.reportUrl})`);
  lines.push(``, `_Interview ${report.interviewId}_`);
  return lines.join("\n");
}

/** Stable projection checksum for reconciliation (jobs). */
export function jobChecksum(job: ATSJob): string {
  return createHash("sha256").update(`${job.id}|${job.title}|${job.status}|${job.updatedAt}`).digest("hex").slice(0, 32);
}

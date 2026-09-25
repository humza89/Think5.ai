/**
 * ATSAdapter contract (T0.5; T15 puts Greenhouse behind it, the existing
 * `lib/ats/*` clients are adapted, not rewritten).
 *
 * Every write takes an idempotency key: replaying the same key must not
 * create a second candidate, note or report, and must report `deduplicated`.
 * `capabilities()` tells the UI which actions to grey out per provider.
 */

export type ATSProviderId = "greenhouse" | "lever" | "workday" | "ashby";

export interface ATSConnectionConfig {
  provider: ATSProviderId;
  tenantId: string;
  apiKey: string;
  baseUrl?: string;
  webhookSecret?: string;
}

export interface ATSConnection {
  connected: boolean;
  accountName?: string;
  detail?: string;
}

export interface ATSJob {
  id: string;
  title: string;
  status: "open" | "closed" | "draft";
  /** ISO-8601. */
  updatedAt: string;
}

export interface ATSCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobIds: string[];
  stage?: string;
  externalUrl?: string;
}

export type ATSCandidateInput = Omit<ATSCandidate, "id"> & { id?: string };

export interface ATSWriteOptions {
  /** Caller-chosen key; the same key replays the same write. */
  idempotencyKey: string;
}

export interface ATSWriteResult {
  id: string;
  created: boolean;
  idempotencyKey: string;
  /** True when this key had already been applied; nothing changed. */
  deduplicated: boolean;
}

export interface InterviewReportAttachment {
  interviewId: string;
  summary: string;
  overallScore?: number;
  recommendation?: string;
  reportUrl?: string;
}

export interface ATSWebhookRequest {
  headers: Readonly<Record<string, string>>;
  rawBody: string;
}

export type ATSEventType = "candidate.updated" | "candidate.stage_changed" | "application.rejected" | "job.updated";

export interface ATSEvent {
  type: ATSEventType;
  providerEventId: string;
  /** ISO-8601. */
  occurredAt: string;
  payload: unknown;
}

export interface ATSCapabilities {
  listJobs: boolean;
  getCandidate: boolean;
  upsertCandidate: boolean;
  attachInterviewReport: boolean;
  webhooks: boolean;
  advanceStage: boolean;
  reject: boolean;
}

export interface ATSAdapter {
  readonly provider: ATSProviderId;
  connect(config: ATSConnectionConfig): Promise<ATSConnection>;
  listJobs(since?: string): Promise<ATSJob[]>;
  getCandidate(id: string): Promise<ATSCandidate | null>;
  upsertCandidate(candidate: ATSCandidateInput, options: ATSWriteOptions): Promise<ATSWriteResult>;
  attachInterviewReport(candidateId: string, report: InterviewReportAttachment, options: ATSWriteOptions): Promise<ATSWriteResult>;
  verifyWebhook(request: ATSWebhookRequest): Promise<boolean>;
  parseWebhook(body: string): ATSEvent[];
  capabilities(): ATSCapabilities;
}

export interface InMemoryATSOptions {
  provider?: ATSProviderId;
  webhookSecret?: string;
  jobs?: ATSJob[];
}

/** Reference adapter with idempotent writes and HMAC-free signature check for tests. */
export class InMemoryATSAdapter implements ATSAdapter {
  readonly provider: ATSProviderId;
  private connection: ATSConnectionConfig | null = null;
  private readonly webhookSecret: string;
  private readonly jobs: ATSJob[];
  private readonly candidates = new Map<string, ATSCandidate>();
  private readonly reports = new Map<string, InterviewReportAttachment[]>();
  private readonly applied = new Map<string, ATSWriteResult>();
  private idSeq = 0;

  constructor(options: InMemoryATSOptions = {}) {
    this.provider = options.provider ?? "greenhouse";
    this.webhookSecret = options.webhookSecret ?? "test-secret";
    this.jobs = options.jobs ?? [];
  }

  private requireConnection(): void {
    if (!this.connection) throw new Error("ATSAdapter is not connected; call connect() first");
  }

  async connect(config: ATSConnectionConfig): Promise<ATSConnection> {
    if (config.provider !== this.provider) {
      return { connected: false, detail: `adapter is for ${this.provider}, got ${config.provider}` };
    }
    if (!config.apiKey) return { connected: false, detail: "apiKey is required" };
    this.connection = config;
    return { connected: true, accountName: `${config.tenantId}@${this.provider}` };
  }

  async listJobs(since?: string): Promise<ATSJob[]> {
    this.requireConnection();
    const cutoff = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
    return this.jobs.filter((job) => Date.parse(job.updatedAt) >= cutoff).map((job) => ({ ...job }));
  }

  async getCandidate(id: string): Promise<ATSCandidate | null> {
    this.requireConnection();
    const candidate = this.candidates.get(id);
    return candidate ? { ...candidate, jobIds: [...candidate.jobIds] } : null;
  }

  async upsertCandidate(candidate: ATSCandidateInput, options: ATSWriteOptions): Promise<ATSWriteResult> {
    this.requireConnection();
    if (!options?.idempotencyKey) throw new Error("upsertCandidate requires an idempotencyKey");
    const replay = this.applied.get(`upsert:${options.idempotencyKey}`);
    if (replay) return { ...replay, deduplicated: true };

    const id = candidate.id ?? `cand-${++this.idSeq}`;
    const created = !this.candidates.has(id);
    this.candidates.set(id, { ...candidate, id, jobIds: [...candidate.jobIds] });
    const result: ATSWriteResult = { id, created, idempotencyKey: options.idempotencyKey, deduplicated: false };
    this.applied.set(`upsert:${options.idempotencyKey}`, result);
    return result;
  }

  async attachInterviewReport(
    candidateId: string,
    report: InterviewReportAttachment,
    options: ATSWriteOptions,
  ): Promise<ATSWriteResult> {
    this.requireConnection();
    if (!options?.idempotencyKey) throw new Error("attachInterviewReport requires an idempotencyKey");
    if (!this.candidates.has(candidateId)) throw new Error(`Unknown candidate ${candidateId}`);
    const replay = this.applied.get(`report:${options.idempotencyKey}`);
    if (replay) return { ...replay, deduplicated: true };

    const list = this.reports.get(candidateId) ?? [];
    list.push({ ...report });
    this.reports.set(candidateId, list);
    const result: ATSWriteResult = {
      id: `${candidateId}:${report.interviewId}`,
      created: true,
      idempotencyKey: options.idempotencyKey,
      deduplicated: false,
    };
    this.applied.set(`report:${options.idempotencyKey}`, result);
    return result;
  }

  async verifyWebhook(request: ATSWebhookRequest): Promise<boolean> {
    const signature = request.headers["x-ats-signature"] ?? request.headers["X-ATS-Signature"];
    return signature === `${this.webhookSecret}:${request.rawBody.length}`;
  }

  parseWebhook(body: string): ATSEvent[] {
    const parsed = JSON.parse(body) as { events?: Array<Partial<ATSEvent>> };
    return (parsed.events ?? []).map((event, index) => ({
      type: (event.type ?? "candidate.updated") as ATSEventType,
      providerEventId: event.providerEventId ?? `evt-${index}`,
      occurredAt: event.occurredAt ?? new Date(0).toISOString(),
      payload: event.payload ?? null,
    }));
  }

  capabilities(): ATSCapabilities {
    return {
      listJobs: true,
      getCandidate: true,
      upsertCandidate: true,
      attachInterviewReport: true,
      webhooks: true,
      advanceStage: false,
      reject: false,
    };
  }

  /** Test helper: reports attached to a candidate. */
  reportsFor(candidateId: string): readonly InterviewReportAttachment[] {
    return [...(this.reports.get(candidateId) ?? [])];
  }
}

/**
 * ATS sync engine (Phase 0 T15) over the `ATSAdapter` contract.
 *
 * Flows (Greenhouse first; provider-neutral where the contract allows):
 *   import jobs      — open remote jobs → local `Job` rows, linked through
 *                      `ATSEntityLink(localType="job")`, checksum + remoteUpdatedAt
 *                      so an unchanged job is skipped and never duplicated.
 *   push candidate   — an `Application` on a linked job → remote candidate +
 *                      application (idempotency key `application:{id}`).
 *   push report      — a REPORT_READY interview → remote note with the summary
 *                      and report link (idempotency key `report:{interviewId}`).
 *   webhook          — verified inbound event, deduplicated by providerEventId,
 *                      applied to the linked local entity.
 * Every run writes an `ATSSyncRun` (counts + errors) and emits one `ats.sync`
 * usage event (T16). Rate limits surface as `GreenhouseRateLimitError` and end
 * the run with status "error" and the retry-after recorded; Inngest retries.
 *
 * The engine depends on a narrow `SyncDb` so tests run against an in-memory
 * fake; production passes Prisma.
 */
import { createHash } from "crypto";
import type { ATSAdapter, ATSConnectionConfig, ATSEvent, ATSJob, ATSWriteResult } from "@/lib/contracts/ats";
import { GreenhouseAdapter, GreenhouseRateLimitError, jobChecksum, type IdempotencyStore } from "@/lib/ats/adapters/greenhouse";

export type SyncDirection = "import" | "export" | "webhook";
export type LinkType = "job" | "candidate" | "application" | "report" | "idempotency" | "webhook-event";

export interface IntegrationRow {
  id: string;
  companyId: string;
  provider: string;
  apiKey: string; // encrypted at rest (lib/ats/encryption.ts) or plaintext in tests
  webhookSecret: string | null;
  baseUrl: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
}

export interface LinkRow {
  id: string;
  integrationId: string;
  localType: string;
  localId: string;
  remoteId: string;
  remoteUpdatedAt: Date | null;
  lastSyncedAt: Date;
  checksum: string | null;
  state: unknown;
  lastError: string | null;
}

export interface SyncRunRow {
  id: string;
  integrationId: string;
  direction: string;
  trigger: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  counts: unknown;
  errors: unknown;
}

export interface SyncCounts { fetched: number; created: number; updated: number; skipped: number; failed: number }
export interface SyncError { remoteId?: string; localId?: string; message: string }

export interface SyncDb {
  aTSIntegration: {
    findUnique(args: { where: { id: string } }): Promise<IntegrationRow | null>;
    findMany(args: { where: Record<string, unknown> }): Promise<IntegrationRow[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  aTSEntityLink: {
    findUnique(args: { where: { integrationId_localType_localId?: { integrationId: string; localType: string; localId: string }; integrationId_localType_remoteId?: { integrationId: string; localType: string; remoteId: string } } }): Promise<LinkRow | null>;
    findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<LinkRow[]>;
    upsert(args: { where: { integrationId_localType_localId: { integrationId: string; localType: string; localId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<LinkRow>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  aTSSyncRun: {
    create(args: { data: Record<string, unknown> }): Promise<SyncRunRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<SyncRunRow>;
  };
  job: {
    findUnique(args: { where: { id: string }; select?: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  recruiter: { findFirst(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{ id: string } | null> };
  application: { findUnique(args: { where: { id: string }; include?: Record<string, unknown> }): Promise<Record<string, unknown> | null>; update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown> };
  interview: { findUnique(args: { where: { id: string }; include?: Record<string, unknown>; select?: Record<string, unknown> }): Promise<Record<string, unknown> | null> };
}

export interface SyncDeps {
  db: SyncDb;
  /** Builds a connected adapter for an integration (production: decrypt key, GreenhouseAdapter). */
  adapterFor: (integration: IntegrationRow, db: SyncDb) => Promise<ATSAdapter>;
  /** T16 emit; never throws. */
  recordUsage?: (input: { id: string; tenantId: string; kind: "ats.sync"; quantity: number; subjectId: string; source: string; metadata?: Record<string, string | number | boolean | null> }) => Promise<unknown>;
  appUrl?: string;
  now?: () => Date;
}

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: SyncDb, private readonly integrationId: string) {}
  async get(key: string): Promise<ATSWriteResult | null> {
    const row = await this.db.aTSEntityLink.findUnique({ where: { integrationId_localType_localId: { integrationId: this.integrationId, localType: "idempotency", localId: key } } });
    return row ? (row.state as ATSWriteResult) : null;
  }
  async set(key: string, result: ATSWriteResult): Promise<void> {
    await this.db.aTSEntityLink.upsert({
      where: { integrationId_localType_localId: { integrationId: this.integrationId, localType: "idempotency", localId: key } },
      create: { integrationId: this.integrationId, localType: "idempotency", localId: key, remoteId: `${key}→${result.id}`, state: result as unknown as Record<string, unknown> },
      update: { state: result as unknown as Record<string, unknown>, lastSyncedAt: new Date() },
    });
  }
}

/** Production adapter factory: decrypts the stored key when it is encrypted. */
export async function defaultAdapterFor(integration: IntegrationRow, db: SyncDb): Promise<ATSAdapter> {
  if (integration.provider !== "greenhouse") throw new Error(`Provider ${integration.provider} is not implemented in Phase 0 (Greenhouse only)`);
  let apiKey = integration.apiKey;
  try {
    const { isEncrypted, decryptATSKey } = await import("@/lib/ats/encryption");
    if (isEncrypted(apiKey) && process.env.ATS_ENCRYPTION_KEY) apiKey = decryptATSKey(apiKey);
  } catch {
    /* plaintext key (tests) */
  }
  const cfg = (integration.config ?? {}) as { onBehalfOf?: string };
  const adapter = new GreenhouseAdapter({ idempotency: new PrismaIdempotencyStore(db, integration.id), onBehalfOf: cfg.onBehalfOf });
  const config: ATSConnectionConfig = { provider: "greenhouse", tenantId: integration.companyId, apiKey, baseUrl: integration.baseUrl ?? undefined, webhookSecret: integration.webhookSecret ?? undefined };
  const connection = await adapter.connect(config);
  if (!connection.connected) throw new Error(`Greenhouse connection failed: ${connection.detail ?? "unknown"}`);
  return adapter;
}

function emptyCounts(): SyncCounts { return { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0 }; }

async function withRun<T>(deps: SyncDeps, integration: IntegrationRow, direction: SyncDirection, trigger: string, fn: (counts: SyncCounts, errors: SyncError[]) => Promise<T>): Promise<{ run: SyncRunRow; counts: SyncCounts; errors: SyncError[]; result?: T }> {
  const now = deps.now ?? (() => new Date());
  const run = await deps.db.aTSSyncRun.create({ data: { integrationId: integration.id, direction, trigger, status: "running", startedAt: now() } });
  const counts = emptyCounts();
  const errors: SyncError[] = [];
  let status = "success";
  let result: T | undefined;
  try {
    result = await fn(counts, errors);
    if (errors.length && counts.failed === errors.length && counts.created + counts.updated + counts.skipped === 0) status = "error";
    else if (errors.length) status = "partial";
  } catch (err) {
    status = "error";
    errors.push({ message: err instanceof GreenhouseRateLimitError ? `rate_limited retryAfterMs=${err.retryAfterMs}` : err instanceof Error ? err.message : String(err) });
  }
  const finished = await deps.db.aTSSyncRun.update({ where: { id: run.id }, data: { status, finishedAt: now(), counts, errors } });
  await deps.db.aTSIntegration.update({ where: { id: integration.id }, data: { lastSyncAt: now(), syncStatus: status === "success" ? "idle" : status, syncError: errors[0]?.message ?? null } }).catch(() => {});
  if (deps.recordUsage) {
    await deps.recordUsage({ id: `ats-sync:${run.id}`, tenantId: integration.companyId, kind: "ats.sync", quantity: 1, subjectId: run.id, source: "ats.sync", metadata: { provider: integration.provider, direction, status, created: counts.created, updated: counts.updated, failed: counts.failed } }).catch(() => {});
  }
  if (status === "error" && errors[0]?.message.startsWith("rate_limited")) throw new GreenhouseRateLimitError(Number(/retryAfterMs=(\d+)/.exec(errors[0].message)?.[1] ?? 30_000));
  return { run: finished, counts, errors, result };
}

async function connectedByRecruiter(deps: SyncDeps, integration: IntegrationRow): Promise<string> {
  const cfg = (integration.config ?? {}) as { connectedByRecruiterId?: string };
  if (cfg.connectedByRecruiterId) return cfg.connectedByRecruiterId;
  const first = await deps.db.recruiter.findFirst({ where: { companyId: integration.companyId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!first) throw new Error("No recruiter in this company to own imported jobs");
  return first.id;
}

/** Step 2: import open jobs (create/update, never duplicate). */
export async function importJobs(deps: SyncDeps, integrationId: string, trigger = "manual") {
  const integration = await deps.db.aTSIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.enabled) throw new Error("Integration not found or disabled");
  return withRun(deps, integration, "import", trigger, async (counts, errors) => {
    const adapter = await deps.adapterFor(integration, deps.db);
    const jobs = await adapter.listJobs();
    counts.fetched = jobs.length;
    const ownerId = await connectedByRecruiter(deps, integration);
    for (const remote of jobs) {
      try {
        await upsertLinkedJob(deps, integration, remote, ownerId, counts);
      } catch (err) {
        counts.failed++;
        errors.push({ remoteId: remote.id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return { imported: counts.created + counts.updated };
  });
}

async function upsertLinkedJob(deps: SyncDeps, integration: IntegrationRow, remote: ATSJob, ownerId: string, counts: SyncCounts): Promise<void> {
  const checksum = jobChecksum(remote);
  const existing = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_remoteId: { integrationId: integration.id, localType: "job", remoteId: remote.id } } });
  if (existing && existing.checksum === checksum) {
    counts.skipped++;
    return;
  }
  const status = remote.status === "open" ? "ACTIVE" : remote.status === "draft" ? "DRAFT" : "CLOSED";
  let localId = existing?.localId;
  if (localId && (await deps.db.job.findUnique({ where: { id: localId }, select: { id: true } }))) {
    await deps.db.job.update({ where: { id: localId }, data: { title: remote.title, status } });
    counts.updated++;
  } else {
    const created = await deps.db.job.create({
      data: { title: remote.title, description: `Imported from Greenhouse (job ${remote.id}).`, status, recruiterId: ownerId, companyId: integration.companyId },
    });
    localId = created.id;
    counts.created++;
  }
  await deps.db.aTSEntityLink.upsert({
    where: { integrationId_localType_localId: { integrationId: integration.id, localType: "job", localId } },
    create: { integrationId: integration.id, localType: "job", localId, remoteId: remote.id, remoteUpdatedAt: new Date(remote.updatedAt), checksum, state: { remote }, lastError: null },
    update: { remoteId: remote.id, remoteUpdatedAt: new Date(remote.updatedAt), checksum, state: { remote }, lastSyncedAt: new Date(), lastError: null },
  });
}

/** Step 3: push a candidate + application for an Application on a linked job. */
export async function pushApplication(deps: SyncDeps, integrationId: string, applicationId: string, trigger = "event") {
  const integration = await deps.db.aTSIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.enabled) throw new Error("Integration not found or disabled");
  return withRun(deps, integration, "export", trigger, async (counts, errors) => {
    const application = (await deps.db.application.findUnique({ where: { id: applicationId }, include: { candidate: true, job: true } })) as
      | { id: string; jobId: string; candidate: { id: string; fullName: string; email: string | null }; job: { id: string; companyId: string } }
      | null;
    if (!application) throw new Error(`Application ${applicationId} not found`);
    if (application.job.companyId !== integration.companyId) throw new Error("Application belongs to another tenant");
    counts.fetched = 1;
    const jobLink = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_localId: { integrationId: integration.id, localType: "job", localId: application.jobId } } });
    if (!jobLink) {
      counts.skipped++;
      errors.push({ localId: applicationId, message: "job is not linked to Greenhouse; import jobs first" });
      return { pushed: false };
    }
    const adapter = await deps.adapterFor(integration, deps.db);
    const [firstName, ...rest] = application.candidate.fullName.trim().split(/\s+/);
    const existingCandidateLink = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_localId: { integrationId: integration.id, localType: "candidate", localId: application.candidate.id } } });
    try {
      const result = await adapter.upsertCandidate(
        { id: existingCandidateLink?.remoteId, firstName: firstName || "Candidate", lastName: rest.join(" ") || "-", email: application.candidate.email ?? undefined, jobIds: [jobLink.remoteId] },
        { idempotencyKey: `application:${application.id}` },
      );
      if (result.deduplicated) counts.skipped++;
      else if (result.created) counts.created++;
      else counts.updated++;
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "candidate", localId: application.candidate.id } },
        create: { integrationId: integration.id, localType: "candidate", localId: application.candidate.id, remoteId: result.id, state: { jobIds: [jobLink.remoteId] }, lastError: null },
        update: { remoteId: result.id, lastSyncedAt: new Date(), lastError: null },
      });
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "application", localId: application.id } },
        create: { integrationId: integration.id, localType: "application", localId: application.id, remoteId: `${result.id}:${jobLink.remoteId}`, state: { candidateRemoteId: result.id, jobRemoteId: jobLink.remoteId }, lastError: null },
        update: { remoteId: `${result.id}:${jobLink.remoteId}`, lastSyncedAt: new Date(), lastError: null },
      });
      return { pushed: true, remoteCandidateId: result.id };
    } catch (err) {
      counts.failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ localId: applicationId, message });
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "application", localId: application.id } },
        create: { integrationId: integration.id, localType: "application", localId: application.id, remoteId: `pending:${application.id}`, lastError: message },
        update: { lastError: message },
      }).catch(() => {});
      if (err instanceof GreenhouseRateLimitError) throw err;
      return { pushed: false };
    }
  });
}

/** Step 4: attach the interview report to the linked candidate. */
export async function pushReport(deps: SyncDeps, integrationId: string, interviewId: string, trigger = "event") {
  const integration = await deps.db.aTSIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.enabled) throw new Error("Integration not found or disabled");
  return withRun(deps, integration, "export", trigger, async (counts, errors) => {
    const interview = (await deps.db.interview.findUnique({ where: { id: interviewId }, include: { interviewReport: true } })) as
      | { id: string; candidateId: string; companyId: string | null; status: string; overallScore: number | null; interviewReport: { summary: string; recommendation: string | null } | null }
      | null;
    if (!interview) throw new Error(`Interview ${interviewId} not found`);
    if (interview.companyId && interview.companyId !== integration.companyId) throw new Error("Interview belongs to another tenant");
    counts.fetched = 1;
    if (interview.status !== "REPORT_READY" || !interview.interviewReport) {
      counts.skipped++;
      errors.push({ localId: interviewId, message: `report not ready (status ${interview.status})` });
      return { pushed: false };
    }
    const candidateLink = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_localId: { integrationId: integration.id, localType: "candidate", localId: interview.candidateId } } });
    if (!candidateLink) {
      counts.skipped++;
      errors.push({ localId: interviewId, message: "candidate is not linked to Greenhouse" });
      return { pushed: false };
    }
    const adapter = await deps.adapterFor(integration, deps.db);
    const appUrl = deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    try {
      const result = await adapter.attachInterviewReport(
        candidateLink.remoteId,
        { interviewId, summary: interview.interviewReport.summary, overallScore: interview.overallScore ?? undefined, recommendation: interview.interviewReport.recommendation ?? undefined, reportUrl: appUrl ? `${appUrl}/interviews/${interviewId}/report` : undefined },
        { idempotencyKey: `report:${interviewId}` },
      );
      if (result.deduplicated) counts.skipped++; else counts.created++;
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "report", localId: interviewId } },
        create: { integrationId: integration.id, localType: "report", localId: interviewId, remoteId: result.id, state: { candidateRemoteId: candidateLink.remoteId }, lastError: null },
        update: { remoteId: result.id, lastSyncedAt: new Date(), lastError: null },
      });
      return { pushed: true };
    } catch (err) {
      counts.failed++;
      errors.push({ localId: interviewId, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof GreenhouseRateLimitError) throw err;
      return { pushed: false };
    }
  });
}

/** Step 5: verified inbound webhook → dedupe → apply. */
export async function applyWebhook(deps: SyncDeps, integrationId: string, request: { headers: Record<string, string>; rawBody: string }) {
  const integration = await deps.db.aTSIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.enabled) throw new Error("Integration not found or disabled");
  const adapter = await deps.adapterFor(integration, deps.db);
  if (!(await adapter.verifyWebhook(request))) return { accepted: false as const, reason: "invalid_signature" as const };
  const events = adapter.parseWebhook(request.rawBody);
  if (events.length === 0) return { accepted: true as const, applied: 0, deduplicated: 0 };
  const outcome = await withRun(deps, integration, "webhook", "event", async (counts, errors) => {
    let applied = 0;
    let deduplicated = 0;
    for (const event of events) {
      counts.fetched++;
      const seen = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_localId: { integrationId: integration.id, localType: "webhook-event", localId: event.providerEventId } } });
      if (seen) { deduplicated++; counts.skipped++; continue; }
      try {
        await applyEvent(deps, integration, event);
        applied++;
        counts.updated++;
      } catch (err) {
        counts.failed++;
        errors.push({ remoteId: event.providerEventId, message: err instanceof Error ? err.message : String(err) });
      }
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "webhook-event", localId: event.providerEventId } },
        create: { integrationId: integration.id, localType: "webhook-event", localId: event.providerEventId, remoteId: event.providerEventId, state: { type: event.type, occurredAt: event.occurredAt } },
        update: { lastSyncedAt: new Date() },
      });
    }
    return { applied, deduplicated };
  });
  return { accepted: true as const, ...(outcome.result ?? { applied: 0, deduplicated: 0 }), runId: outcome.run.id };
}

const STAGE_TO_APPLICATION_STATUS: Record<string, string> = {
  "Application Review": "APPLIED",
  "Phone Screen": "SCREENING",
  "Technical Interview": "INTERVIEWING",
  "On-site Interview": "INTERVIEWING",
  "Offer": "OFFERED",
  "Hired": "HIRED",
  "Rejected": "REJECTED",
};

async function applyEvent(deps: SyncDeps, integration: IntegrationRow, event: ATSEvent): Promise<void> {
  const payload = (event.payload ?? {}) as { application?: { id?: number; candidate?: { id?: number }; current_stage?: { name?: string }; status?: string; jobs?: Array<{ id: number }> }; job?: { id?: number; name?: string; status?: string; updated_at?: string } };
  if (event.type === "job.updated" && payload.job?.id) {
    const link = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_remoteId: { integrationId: integration.id, localType: "job", remoteId: String(payload.job.id) } } });
    if (!link) return; // not imported here; the next import picks it up
    const status = payload.job.status === "open" ? "ACTIVE" : payload.job.status === "draft" ? "DRAFT" : payload.job.status ? "CLOSED" : undefined;
    await deps.db.job.update({ where: { id: link.localId }, data: { ...(payload.job.name ? { title: payload.job.name } : {}), ...(status ? { status } : {}) } });
    await deps.db.aTSEntityLink.upsert({
      where: { integrationId_localType_localId: { integrationId: integration.id, localType: "job", localId: link.localId } },
      create: { integrationId: integration.id, localType: "job", localId: link.localId, remoteId: String(payload.job.id) },
      update: { lastSyncedAt: new Date(), remoteUpdatedAt: payload.job.updated_at ? new Date(payload.job.updated_at) : undefined, state: { remote: payload.job }, lastError: null },
    });
    return;
  }
  if ((event.type === "candidate.stage_changed" || event.type === "application.rejected" || event.type === "candidate.updated") && payload.application?.candidate?.id) {
    const candidateRemoteId = String(payload.application.candidate.id);
    const candidateLink = await deps.db.aTSEntityLink.findUnique({ where: { integrationId_localType_remoteId: { integrationId: integration.id, localType: "candidate", remoteId: candidateRemoteId } } });
    if (!candidateLink) return;
    const jobRemoteId = payload.application.jobs?.[0]?.id ? String(payload.application.jobs[0].id) : undefined;
    const appLinks = await deps.db.aTSEntityLink.findMany({ where: { integrationId: integration.id, localType: "application", remoteId: jobRemoteId ? `${candidateRemoteId}:${jobRemoteId}` : { startsWith: `${candidateRemoteId}:` } } });
    const stage = event.type === "application.rejected" ? "Rejected" : payload.application.current_stage?.name;
    const status = stage ? STAGE_TO_APPLICATION_STATUS[stage] : undefined;
    for (const appLink of appLinks) {
      if (status) await deps.db.application.update({ where: { id: appLink.localId }, data: { status } });
      await deps.db.aTSEntityLink.upsert({
        where: { integrationId_localType_localId: { integrationId: integration.id, localType: "application", localId: appLink.localId } },
        create: { integrationId: integration.id, localType: "application", localId: appLink.localId, remoteId: appLink.remoteId },
        update: { lastSyncedAt: new Date(), state: { ...(appLink.state as Record<string, unknown> | null ?? {}), remoteStage: stage ?? null, remoteStatus: payload.application.status ?? null }, lastError: null },
      });
    }
  }
}

/** Reconciliation view: link + a mismatch verdict. */
export async function reconciliation(deps: SyncDeps, integrationId: string) {
  const links = await deps.db.aTSEntityLink.findMany({ where: { integrationId, localType: { in: ["job", "candidate", "application", "report"] } }, orderBy: { updatedAt: "desc" }, take: 500 });
  const rows = [];
  for (const link of links) {
    let local: Record<string, unknown> | null = null;
    let mismatch: string | null = link.lastError ? `last error: ${link.lastError}` : null;
    if (link.localType === "job") {
      local = await deps.db.job.findUnique({ where: { id: link.localId }, select: { id: true, title: true, status: true } });
      const remote = (link.state as { remote?: ATSJob } | null)?.remote;
      if (!local) mismatch = "local job missing";
      else if (remote && jobChecksum(remote) !== link.checksum) mismatch = "remote changed since last sync";
      else if (remote && local.title !== remote.title) mismatch = "title differs";
    } else if (link.localType === "application") {
      local = await deps.db.application.findUnique({ where: { id: link.localId } });
      if (!local) mismatch = "local application missing";
      else if (link.remoteId.startsWith("pending:")) mismatch = mismatch ?? "not pushed";
    }
    rows.push({ id: link.id, localType: link.localType, localId: link.localId, remoteId: link.remoteId, lastSyncedAt: link.lastSyncedAt, remoteUpdatedAt: link.remoteUpdatedAt, local, remoteState: link.state, mismatch });
  }
  return rows;
}

export function webhookBodyDigest(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 24);
}

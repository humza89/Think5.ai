/**
 * ATS sync engine (T15) on an in-memory SyncDb with the Greenhouse adapter
 * over recorded fixtures: import never duplicates, pushes are idempotent,
 * report push is gated on REPORT_READY, webhooks are verified + deduplicated,
 * every run is recorded and metered.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GreenhouseAdapter, GreenhouseRateLimitError } from "@/lib/ats/adapters/greenhouse";
import { applyWebhook, importJobs, pushApplication, pushReport, reconciliation, PrismaIdempotencyStore, type IntegrationRow, type LinkRow, type SyncDb, type SyncDeps, type SyncRunRow } from "@/lib/ats/sync";

const FIX = join(__dirname, "fixtures", "greenhouse");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");
const SECRET = "gh-webhook-secret";
const sign = (body: string) => `sha256 ${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function harvest(state: { rateLimited?: boolean } = {}) {
  const calls: string[] = [];
  let nextCandidateId = 7002;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (state.rateLimited) return new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
    if (method === "GET" && url.pathname === "/v1/jobs") return new Response(load("jobs.json"), { status: 200 });
    if (method === "POST" && url.pathname === "/v1/candidates") return new Response(JSON.stringify({ ...JSON.parse(load("candidate-created.json")), id: nextCandidateId++ }), { status: 201 });
    if (method === "POST" && /activity_feed\/notes$/.test(url.pathname)) return new Response(load("note-created.json"), { status: 201 });
    return new Response("Not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function fakeDb() {
  const integration: IntegrationRow = { id: "int-1", companyId: "co-1", provider: "greenhouse", apiKey: "harvest-key", webhookSecret: SECRET, baseUrl: null, config: { onBehalfOf: "4012345", connectedByRecruiterId: "rec-1" }, enabled: true };
  const links: LinkRow[] = [];
  const runs: SyncRunRow[] = [];
  const jobs = new Map<string, Record<string, unknown>>();
  const applications = new Map<string, Record<string, unknown>>();
  const interviews = new Map<string, Record<string, unknown>>();
  const integrationUpdates: Record<string, unknown>[] = [];
  const findLink = (w: { integrationId: string; localType: string; localId?: string; remoteId?: string }) => links.find((l) => l.integrationId === w.integrationId && l.localType === w.localType && (w.localId !== undefined ? l.localId === w.localId : l.remoteId === w.remoteId)) ?? null;
  const db: SyncDb = {
    aTSIntegration: {
      async findUnique({ where }) { return where.id === integration.id ? integration : null; },
      async findMany() { return [integration]; },
      async update({ data }) { integrationUpdates.push(data); return integration; },
    },
    aTSEntityLink: {
      async findUnique({ where }) { const w = where.integrationId_localType_localId ?? where.integrationId_localType_remoteId!; return findLink(w); },
      async findMany({ where }) {
        return links.filter((l) => l.integrationId === where.integrationId && (!where.localType || (typeof where.localType === "string" ? l.localType === where.localType : (where.localType as { in: string[] }).in.includes(l.localType))) && (!where.remoteId || (typeof where.remoteId === "string" ? l.remoteId === where.remoteId : l.remoteId.startsWith((where.remoteId as { startsWith: string }).startsWith))));
      },
      async upsert({ where, create, update }) {
        const w = where.integrationId_localType_localId;
        const existing = findLink(w);
        if (existing) { Object.assign(existing, update, { updatedAt: new Date() }); return existing; }
        const row = { id: id("link"), remoteUpdatedAt: null, lastSyncedAt: new Date(), checksum: null, state: null, lastError: null, ...create } as LinkRow;
        links.push(row);
        return row;
      },
      async delete({ where }) { const i = links.findIndex((l) => l.id === where.id); if (i >= 0) links.splice(i, 1); },
    },
    aTSSyncRun: {
      async create({ data }) { const run = { id: id("run"), finishedAt: null, counts: null, errors: null, ...data } as SyncRunRow; runs.push(run); return run; },
      async update({ where, data }) { const run = runs.find((r) => r.id === where.id)!; Object.assign(run, data); return run; },
    },
    job: {
      async findUnique({ where }) { return jobs.get(where.id) ?? null; },
      async create({ data }) { const row = { id: id("job"), ...data }; jobs.set(row.id, row); return { id: row.id }; },
      async update({ where, data }) { Object.assign(jobs.get(where.id)!, data); },
    },
    recruiter: { async findFirst() { return { id: "rec-first" }; } },
    application: { async findUnique({ where }) { return applications.get(where.id) ?? null; }, async update({ where, data }) { Object.assign(applications.get(where.id)!, data); } },
    interview: { async findUnique({ where }) { return interviews.get(where.id) ?? null; } },
  };
  return { db, integration, links, runs, jobs, applications, interviews, integrationUpdates };
}

function deps(f: ReturnType<typeof fakeDb>, h: ReturnType<typeof harvest>, usage: unknown[] = []): SyncDeps {
  return {
    db: f.db,
    adapterFor: async (integration, db) => {
      const adapter = new GreenhouseAdapter({ fetch: h.fetchImpl, idempotency: new PrismaIdempotencyStore(db, integration.id), onBehalfOf: "4012345", sleep: async () => {}, maxRetries: 0 });
      const c = await adapter.connect({ provider: "greenhouse", tenantId: integration.companyId, apiKey: integration.apiKey, webhookSecret: integration.webhookSecret ?? undefined });
      if (!c.connected) throw new Error(c.detail);
      return adapter;
    },
    recordUsage: async (input) => { usage.push(input); },
    appUrl: "https://app.test",
  };
}

describe("ATS sync engine (T15)", () => {
  let f: ReturnType<typeof fakeDb>;
  beforeEach(() => { f = fakeDb(); });

  it("imports open jobs once, skips unchanged ones on re-run, records runs and meters each run", async () => {
    const usage: unknown[] = [];
    const d = deps(f, harvest(), usage);
    const first = await importJobs(d, "int-1", "manual");
    expect(first.counts).toEqual({ fetched: 3, created: 3, updated: 0, skipped: 0, failed: 0 });
    expect([...f.jobs.values()].map((j) => `${j.title}:${j.status}:${j.recruiterId}`).sort()).toEqual(["Recruiting Coordinator:CLOSED:rec-1", "Robotics Field Engineer:ACTIVE:rec-1", "Senior Backend Engineer:ACTIVE:rec-1"]);
    const second = await importJobs(d, "int-1", "schedule");
    expect(second.counts).toEqual({ fetched: 3, created: 0, updated: 0, skipped: 3, failed: 0 });
    expect(f.jobs.size).toBe(3);
    expect(f.links.filter((l) => l.localType === "job")).toHaveLength(3);
    expect(f.runs.map((r) => `${r.direction}:${r.trigger}:${r.status}`)).toEqual(["import:manual:success", "import:schedule:success"]);
    expect(usage).toHaveLength(2);
    expect(usage[0]).toMatchObject({ kind: "ats.sync", tenantId: "co-1", metadata: expect.objectContaining({ provider: "greenhouse", direction: "import", created: 3 }) });
    expect(f.integrationUpdates.at(-1)).toMatchObject({ syncStatus: "idle", syncError: null });
  });

  it("pushes an application idempotently and refuses when the job is not linked", async () => {
    const h = harvest();
    const d = deps(f, h);
    f.applications.set("app-1", { id: "app-1", jobId: "job-x", candidate: { id: "cand-1", fullName: "Priya N", email: "priya@example.test" }, job: { id: "job-x", companyId: "co-1" } });
    const unlinked = await pushApplication(d, "int-1", "app-1");
    expect(unlinked.result).toEqual({ pushed: false });
    expect(unlinked.errors[0].message).toMatch(/not linked/);

    await importJobs(d, "int-1");
    const jobLink = f.links.find((l) => l.localType === "job" && l.remoteId === "4001")!;
    f.applications.set("app-2", { id: "app-2", jobId: jobLink.localId, candidate: { id: "cand-2", fullName: "Priya N", email: "priya@example.test" }, job: { id: jobLink.localId, companyId: "co-1" } });
    const pushed = await pushApplication(d, "int-1", "app-2");
    expect(pushed.result).toMatchObject({ pushed: true, remoteCandidateId: "7002" });
    expect(pushed.counts.created).toBe(1);
    const again = await pushApplication(d, "int-1", "app-2");
    expect(again.counts).toMatchObject({ skipped: 1, created: 0 });
    expect(h.calls.filter((c) => c === "POST /v1/candidates")).toHaveLength(1);
    expect(f.links.find((l) => l.localType === "candidate" && l.localId === "cand-2")?.remoteId).toBe("7002");
    expect(f.links.find((l) => l.localType === "application" && l.localId === "app-2")?.remoteId).toBe("7002:4001");
  });

  it("pushes a report only when REPORT_READY and the candidate is linked; replays are deduplicated", async () => {
    const h = harvest();
    const d = deps(f, h);
    f.interviews.set("int-a", { id: "int-a", candidateId: "cand-9", companyId: "co-1", status: "IN_PROGRESS", overallScore: null, interviewReport: null });
    expect((await pushReport(d, "int-1", "int-a")).errors[0].message).toMatch(/report not ready/);
    f.interviews.set("int-b", { id: "int-b", candidateId: "cand-9", companyId: "co-1", status: "REPORT_READY", overallScore: 84, interviewReport: { summary: "Strong.", recommendation: "YES" } });
    expect((await pushReport(d, "int-1", "int-b")).errors[0].message).toMatch(/not linked/);
    f.links.push({ id: "l-c", integrationId: "int-1", localType: "candidate", localId: "cand-9", remoteId: "7001", remoteUpdatedAt: null, lastSyncedAt: new Date(), checksum: null, state: null, lastError: null });
    const pushed = await pushReport(d, "int-1", "int-b");
    expect(pushed.result).toEqual({ pushed: true });
    const replay = await pushReport(d, "int-1", "int-b");
    expect(replay.counts.skipped).toBe(1);
    expect(h.calls.filter((c) => c === "POST /v1/candidates/7001/activity_feed/notes")).toHaveLength(1);
    expect(f.links.find((l) => l.localType === "report" && l.localId === "int-b")).toBeTruthy();
  });

  it("verifies, deduplicates and applies webhooks to linked entities", async () => {
    const d = deps(f, harvest());
    await importJobs(d, "int-1");
    const jobLink = f.links.find((l) => l.localType === "job" && l.remoteId === "4002")!;
    f.links.push({ id: "l-c", integrationId: "int-1", localType: "candidate", localId: "cand-2", remoteId: "7002", remoteUpdatedAt: null, lastSyncedAt: new Date(), checksum: null, state: null, lastError: null });
    f.links.push({ id: "l-a", integrationId: "int-1", localType: "application", localId: "app-2", remoteId: "7002:4001", remoteUpdatedAt: null, lastSyncedAt: new Date(), checksum: null, state: null, lastError: null });
    f.applications.set("app-2", { id: "app-2", status: "APPLIED" });

    const stage = load("webhook-stage-change.json");
    expect(await applyWebhook(d, "int-1", { headers: { signature: "sha256 bad" }, rawBody: stage })).toEqual({ accepted: false, reason: "invalid_signature" });
    const first = await applyWebhook(d, "int-1", { headers: { signature: sign(stage) }, rawBody: stage });
    expect(first).toMatchObject({ accepted: true, applied: 1, deduplicated: 0 });
    expect(f.applications.get("app-2")?.status).toBe("INTERVIEWING");
    const replay = await applyWebhook(d, "int-1", { headers: { signature: sign(stage) }, rawBody: stage });
    expect(replay).toMatchObject({ accepted: true, applied: 0, deduplicated: 1 });

    const jobBody = load("webhook-job-updated.json");
    await applyWebhook(d, "int-1", { headers: { signature: sign(jobBody) }, rawBody: jobBody });
    expect(f.jobs.get(jobLink.localId)?.title).toBe("Robotics Field Engineer II");
    expect(f.runs.filter((r) => r.direction === "webhook")).toHaveLength(3);
  });

  it("surfaces rate limiting as a typed error after recording the run", async () => {
    const h = harvest({ rateLimited: true });
    const d = deps(f, h);
    await expect(importJobs(d, "int-1")).rejects.toBeInstanceOf(GreenhouseRateLimitError);
    expect(f.runs[0]).toMatchObject({ status: "error" });
    expect((f.runs[0].errors as Array<{ message: string }>)[0].message).toMatch(/rate_limited|Greenhouse/);
  });

  it("reconciliation flags missing locals, remote drift and pending pushes", async () => {
    const d = deps(f, harvest());
    await importJobs(d, "int-1");
    const link = f.links.find((l) => l.localType === "job" && l.remoteId === "4001")!;
    f.jobs.delete(link.localId);
    const drifted = f.links.find((l) => l.localType === "job" && l.remoteId === "4002")!;
    drifted.checksum = "stale";
    f.links.push({ id: "l-p", integrationId: "int-1", localType: "application", localId: "app-7", remoteId: "pending:app-7", remoteUpdatedAt: null, lastSyncedAt: new Date(), checksum: null, state: null, lastError: "Greenhouse API error (422)" });
    f.applications.set("app-7", { id: "app-7" });
    const rows = await reconciliation(d, "int-1");
    const byRemote = Object.fromEntries(rows.map((r) => [r.remoteId, r.mismatch]));
    expect(byRemote["4001"]).toBe("local job missing");
    expect(byRemote["4002"]).toBe("remote changed since last sync");
    expect(byRemote["4003"]).toBeNull();
    expect(byRemote["pending:app-7"]).toMatch(/last error/);
  });
});

/**
 * GreenhouseAdapter (T15) against recorded Harvest fixtures: contract
 * conformance, idempotent writes, 429 backoff, webhook signature and parsing.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runATSAdapterConformance } from "@/lib/contracts/conformance/ats";
import { GreenhouseAdapter, GreenhouseRateLimitError, InMemoryIdempotencyStore, formatReportNote, toATSCandidate, toATSJob } from "@/lib/ats/adapters/greenhouse";

const FIX = join(__dirname, "fixtures", "greenhouse");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");
const SECRET = "gh-webhook-secret";
const sign = (body: string) => `sha256 ${createHmac("sha256", SECRET).update(body).digest("hex")}`;

interface Recorded { method: string; path: string; body?: unknown; headers: Record<string, string> }

/** Fixture-backed Harvest API. Records calls; can inject 429s. */
function harvest(options: { rateLimitFirst?: number } = {}) {
  const calls: Recorded[] = [];
  let remaining429 = options.rateLimitFirst ?? 0;
  let nextCandidateId = 7002;
  // Created/updated candidates are served back on GET, like the real API.
  const candidates = new Map<string, Record<string, unknown>>([["7001", JSON.parse(load("candidate-7001.json"))]]);
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    calls.push({ method, path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers });
    if (!headers.Authorization?.startsWith("Basic ")) return new Response("Unauthorized", { status: 401 });
    if (Buffer.from(headers.Authorization.slice(6), "base64").toString("utf8") !== "harvest-key:") return new Response("Unauthorized", { status: 401 });
    if (remaining429 > 0) { remaining429--; return new Response("Rate limit", { status: 429, headers: { "retry-after": "1" } }); }
    if (method === "GET" && url.pathname === "/v1/jobs") return new Response(load("jobs.json"), { status: 200, headers: { "content-type": "application/json" } });
    const candidateMatch = /^\/v1\/candidates\/(\d+)$/.exec(url.pathname);
    if (method === "GET" && candidateMatch) {
      const found = candidates.get(candidateMatch[1]);
      return found ? new Response(JSON.stringify(found), { status: 200 }) : new Response("Not found", { status: 404 });
    }
    if (method === "POST" && url.pathname === "/v1/candidates") {
      const input = init?.body ? JSON.parse(String(init.body)) : {};
      const created = { ...JSON.parse(load("candidate-created.json")), id: nextCandidateId++, first_name: input.first_name, last_name: input.last_name, email_addresses: input.email_addresses ?? [], applications: (input.applications ?? []).map((a: { job_id: number }, i: number) => ({ id: 9100 + i, jobs: [{ id: a.job_id, name: "Job " + a.job_id }], current_stage: { id: 50, name: "Application Review" }, status: "active" })) };
      candidates.set(String(created.id), created);
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (method === "PATCH" && candidateMatch) {
      const existing = candidates.get(candidateMatch[1]);
      if (!existing) return new Response("Not found", { status: 404 });
      const input = init?.body ? JSON.parse(String(init.body)) : {};
      const updated = { ...existing, ...(input.first_name ? { first_name: input.first_name } : {}), ...(input.last_name ? { last_name: input.last_name } : {}) };
      candidates.set(candidateMatch[1], updated);
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === "POST" && /\/v1\/candidates\/\d+\/activity_feed\/notes$/.test(url.pathname)) return new Response(load("note-created.json"), { status: 201 });
    return new Response("Not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

const config = { provider: "greenhouse" as const, tenantId: "co-1", apiKey: "harvest-key", webhookSecret: SECRET };
const noSleep = async () => {};

describe("GreenhouseAdapter (T15)", () => {
  it("passes the T0.5 ATSAdapter conformance harness on recorded fixtures", async () => {
    const body = load("webhook-stage-change.json");
    const violations = await runATSAdapterConformance({
      create: () => new GreenhouseAdapter({ fetch: harvest().fetchImpl, onBehalfOf: "4012345", sleep: noSleep }),
      config,
      validWebhook: { headers: { Signature: sign(body) }, rawBody: body },
      invalidWebhook: { headers: { Signature: sign(body + " ") }, rawBody: body },
    });
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });

  it("maps Harvest jobs and candidates into the contract shapes", async () => {
    const jobs = JSON.parse(load("jobs.json"));
    expect(toATSJob(jobs[0])).toEqual({ id: "4001", title: "Senior Backend Engineer", status: "open", updatedAt: "2026-09-20T10:00:00.000Z" });
    expect(toATSJob(jobs[2]).status).toBe("closed");
    const c = toATSCandidate(JSON.parse(load("candidate-7001.json")));
    expect(c).toMatchObject({ id: "7001", firstName: "Jordan", lastName: "Alvarez", email: "jordan@example.test", jobIds: ["4001"], stage: "Phone Screen" });
  });

  it("connect fails cleanly on a rejected key and sends Basic auth + On-Behalf-Of", async () => {
    const h = harvest();
    const adapter = new GreenhouseAdapter({ fetch: h.fetchImpl, onBehalfOf: "4012345", sleep: noSleep });
    expect(await adapter.connect({ ...config, apiKey: "wrong" })).toMatchObject({ connected: false });
    expect(await adapter.connect(config)).toMatchObject({ connected: true, accountName: "greenhouse:co-1" });
    await adapter.upsertCandidate({ firstName: "Priya", lastName: "N", email: "priya@example.test", jobIds: ["4001"] }, { idempotencyKey: "application:app-1" });
    const post = h.calls.find((c) => c.method === "POST" && c.path === "/v1/candidates")!;
    expect(post.headers["On-Behalf-Of"]).toBe("4012345");
    expect(post.body).toEqual({ first_name: "Priya", last_name: "N", email_addresses: [{ value: "priya@example.test", type: "personal" }], applications: [{ job_id: 4001 }] });
  });

  it("idempotent writes survive a new adapter instance when the store is shared", async () => {
    const store = new InMemoryIdempotencyStore();
    const h = harvest();
    const a1 = new GreenhouseAdapter({ fetch: h.fetchImpl, idempotency: store, sleep: noSleep });
    await a1.connect(config);
    const first = await a1.upsertCandidate({ firstName: "Priya", lastName: "N", jobIds: ["4001"] }, { idempotencyKey: "application:app-9" });
    const a2 = new GreenhouseAdapter({ fetch: h.fetchImpl, idempotency: store, sleep: noSleep });
    await a2.connect(config);
    const replay = await a2.upsertCandidate({ firstName: "Priya", lastName: "N", jobIds: ["4001"] }, { idempotencyKey: "application:app-9" });
    expect(replay).toEqual({ ...first, deduplicated: true });
    expect(h.calls.filter((c) => c.method === "POST" && c.path === "/v1/candidates")).toHaveLength(1);
    const r1 = await a2.attachInterviewReport(first.id, { interviewId: "int-1", summary: "Strong systems thinker.", overallScore: 84, recommendation: "YES", reportUrl: "https://app.test/interviews/int-1/report" }, { idempotencyKey: "report:int-1" });
    const r2 = await a2.attachInterviewReport(first.id, { interviewId: "int-1", summary: "Strong systems thinker.", overallScore: 84 }, { idempotencyKey: "report:int-1" });
    expect(r1.deduplicated).toBe(false);
    expect(r2).toEqual({ ...r1, deduplicated: true });
    expect(h.calls.filter((c) => /activity_feed\/notes$/.test(c.path))).toHaveLength(1);
  });

  it("backs off on 429 using Retry-After and gives up with a typed error", async () => {
    const sleeps: number[] = [];
    const h = harvest({ rateLimitFirst: 2 });
    const adapter = new GreenhouseAdapter({ fetch: h.fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, maxRetries: 3 });
    expect(await adapter.connect(config)).toMatchObject({ connected: true });
    expect(sleeps).toEqual([1000, 1000]);
    const exhausted = new GreenhouseAdapter({ fetch: harvest({ rateLimitFirst: 10 }).fetchImpl, sleep: noSleep, maxRetries: 2 });
    exhausted["config"] = config; // bypass connect (which would itself hit the limiter)
    await expect(exhausted.listJobs()).rejects.toBeInstanceOf(GreenhouseRateLimitError);
  });

  it("verifies Greenhouse signatures in constant time and parses events with stable ids", async () => {
    const adapter = new GreenhouseAdapter({ fetch: harvest().fetchImpl, sleep: noSleep });
    await adapter.connect(config);
    const body = load("webhook-stage-change.json");
    expect(await adapter.verifyWebhook({ headers: { signature: sign(body) }, rawBody: body })).toBe(true);
    expect(await adapter.verifyWebhook({ headers: { Signature: sign(body).replace("sha256 ", "") }, rawBody: body })).toBe(true);
    expect(await adapter.verifyWebhook({ headers: {}, rawBody: body })).toBe(false);
    expect(await adapter.verifyWebhook({ headers: { Signature: sign("other") }, rawBody: body })).toBe(false);
    const [event] = adapter.parseWebhook(body);
    expect(event).toMatchObject({ type: "candidate.stage_changed", occurredAt: "2026-09-25T11:00:00.000Z" });
    expect(event.providerEventId).toMatch(/^gh-[a-f0-9]{24}$/);
    expect(adapter.parseWebhook(body)[0].providerEventId).toBe(event.providerEventId);
    expect(adapter.parseWebhook(load("webhook-job-updated.json"))[0].type).toBe("job.updated");
    expect(adapter.parseWebhook("not json")).toEqual([]);
  });

  it("formats the report note with score, recommendation and link", () => {
    const note = formatReportNote({ interviewId: "int-1", summary: "Clear communicator.", overallScore: 91, recommendation: "STRONG_YES", reportUrl: "https://app.test/interviews/int-1/report" });
    expect(note).toContain("**Overall score:** 91/100");
    expect(note).toContain("**Recommendation:** STRONG_YES");
    expect(note).toContain("[View full report](https://app.test/interviews/int-1/report)");
  });
});

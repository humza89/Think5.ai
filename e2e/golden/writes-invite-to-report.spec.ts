import fs from "node:fs";
import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T14 golden path: invite → consent → text interview → completion → report.
 *
 * Runs against the local Supabase stack with AI_PROVIDER=mock (deterministic
 * interviewer + scorer, no provider key) and an Inngest dev server
 * (INNGEST_DEV=1) so the real durable report pipeline executes. The seeded
 * `interviewGolden` interview starts PENDING on every seed; the candidate
 * authenticates with its access token (the T2 resolver accepts
 * Authorization: Bearer), and the recruiter then opens the report page.
 */
const enabled = process.env.E2E_AUTH_FIXTURES === "true" && (process.env.AI_PROVIDER === "mock" || process.env.AI_PROVIDER_INTERVIEWING === "mock");
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

const id = E2E_FIXTURES.ids.interviewGolden;
const base = `/api/interviews/${id}`;
let bearer: Record<string, string> = { authorization: `Bearer ${E2E_FIXTURES.tokens.goldenAccess}`, "content-type": "application/json" };

/** The room sends the CSRF header even in token mode (T1/T18); the proxy hands the mirror cookie to any client on its first response. */
async function withCsrf(context: BrowserContext): Promise<void> {
  await context.request.get("/api/health");
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (cookie) bearer = { ...bearer, "x-csrf-token": decodeURIComponent(cookie.value) };
}

async function readSse(request: APIRequestContext, data: Record<string, unknown>): Promise<{ status: number; chunks: string[]; done: boolean; raw: string }> {
  const res = await request.post(`${base}/stream`, { headers: bearer, data });
  const raw = await res.text();
  const events = raw.split("\n\n").map((l) => l.replace(/^data: /, "").trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as Array<{ type: string; content?: string }>;
  return { status: res.status(), chunks: events.filter((e) => e.type === "chunk").map((e) => e.content ?? ""), done: events.some((e) => e.type === "done" || e.type === "complete"), raw };
}

test("invite → consent → mocked text interview → durable report → recruiter report page", async ({ browser }) => {
  test.skip(!enabled, "requires the seeded local stack with AI_PROVIDER=mock and an Inngest dev server");
  test.setTimeout(240_000);
  const candidate = await browser.newContext();
  try {
    // Register the app's Inngest functions with the dev server (idempotent) so the
    // interview/completed event reaches interview/report.generate.
    const register = await candidate.request.put("/api/inngest");
    expect([200, 202]).toContain(register.status());
    await withCsrf(candidate);

    // The invitation was accepted by the setup project for the welcome interview; this
    // interview uses its own access token, exactly as the room does after accept.
    const validate = await candidate.request.post(`${base}/validate`, { headers: bearer, data: {} });
    expect(validate.status(), await validate.text()).toBe(200);
    expect(await validate.json()).toMatchObject({ id, candidateName: E2E_FIXTURES.candidate.fullName });

    const consent = await candidate.request.post(`${base}/validate`, { headers: bearer, data: { consentRecording: true, consentProctoring: true, consentPrivacy: true } });
    expect(consent.status(), await consent.text()).toBe(200);

    const start = await readSse(candidate.request, { action: "start" });
    expect(start.status, start.raw).toBe(200);
    expect(start.chunks.join("")).toContain("Aria");

    const answers = [
      "I led the migration of our order pipeline from a nightly batch to an event-driven service. I owned the design, the rollout plan and the on-call handover; the team was four engineers and it shipped in one quarter with zero customer-visible incidents.",
      "The hardest trade-off was exactly-once delivery versus latency. We chose idempotent consumers with at-least-once delivery because it kept the producers simple and let us replay safely; the cost was a deduplication table we had to size and monitor.",
      "A consumer fell behind after a schema change and we served stale totals for an hour. Afterwards I added schema-compat checks in CI, lag alerts per consumer group and a runbook, and we ran a game day to rehearse the replay.",
    ];
    for (const answer of answers) {
      const turn = await readSse(candidate.request, { action: "respond", message: answer });
      expect(turn.status, turn.raw).toBe(200);
      expect(turn.chunks.join("").length).toBeGreaterThan(20);
    }

    const end = await candidate.request.post(`${base}/stream`, { headers: bearer, data: { action: "end" } });
    expect(end.status(), await end.text()).toBe(200);

    // Poll the token-authenticated report status until the durable pipeline has produced the report.
    let ready = false;
    // report-status is rate-limited per path; poll gently (the pipeline needs a few seconds).
    for (let attempt = 0; attempt < 24 && !ready; attempt++) {
      await new Promise((r) => setTimeout(r, 6000));
      const status = await candidate.request.post(`${base}/report-status`, { headers: bearer, data: {} });
      if (status.status() === 429) continue;
      expect(status.status(), await status.text()).toBe(200);
      ready = (await status.json()).ready === true;
    }
    expect(ready, "report generated within 120s through Inngest + mock scorer").toBe(true);
  } finally {
    await candidate.close();
  }

  const recruiter = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const page = await recruiter.newPage();
    await page.goto(`/interviews/${id}/report`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(E2E_FIXTURES.candidate.fullName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/mocked interview/i).first()).toBeVisible({ timeout: 30_000 });
    const detail = await (await recruiter.request.get(`/api/interviews/${id}`)).json();
    const status = detail.status ?? detail.interview?.status;
    expect(["COMPLETED", "REPORT_GENERATING", "REPORT_READY"]).toContain(status);
    await page.close();
  } finally {
    await recruiter.close();
  }
});

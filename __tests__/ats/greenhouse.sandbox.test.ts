/**
 * Nightly Greenhouse sandbox proof (T15 Step 8). Runs only when the sandbox
 * credentials are present (GitHub secret → env); skipped everywhere else so
 * the per-PR suite never depends on an external system.
 *
 * Loop: connect → import jobs → push a candidate → attach a report → parse a
 * webhook body (signature checked with the configured secret). Cleanup is
 * best-effort: the sandbox candidate is tagged with a run id in its name.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GreenhouseAdapter } from "@/lib/ats/adapters/greenhouse";

const apiKey = process.env.GREENHOUSE_SANDBOX_API_KEY;
const onBehalfOf = process.env.GREENHOUSE_SANDBOX_ON_BEHALF_OF;
const webhookSecret = process.env.GREENHOUSE_SANDBOX_WEBHOOK_SECRET ?? "sandbox-secret";
const enabled = Boolean(apiKey && onBehalfOf);

describe.skipIf(!enabled)("Greenhouse sandbox (nightly)", () => {
  const runId = `t15-${Date.now()}`;

  it("connects, imports jobs, pushes a candidate, attaches a report, verifies a webhook", async () => {
    const adapter = new GreenhouseAdapter({ onBehalfOf });
    const connection = await adapter.connect({ provider: "greenhouse", tenantId: "sandbox", apiKey: apiKey!, webhookSecret });
    expect(connection.connected, connection.detail).toBe(true);

    const jobs = await adapter.listJobs();
    expect(Array.isArray(jobs)).toBe(true);
    const open = jobs.find((j) => j.status === "open");
    if (!open) throw new Error("sandbox has no open job to attach a candidate to");

    const created = await adapter.upsertCandidate({ firstName: "Think5", lastName: `Sandbox ${runId}`, email: `${runId}@think5.test`, jobIds: [open.id] }, { idempotencyKey: `sandbox:${runId}` });
    expect(created.created).toBe(true);
    const replay = await adapter.upsertCandidate({ firstName: "Think5", lastName: `Sandbox ${runId}`, jobIds: [open.id] }, { idempotencyKey: `sandbox:${runId}` });
    expect(replay).toMatchObject({ id: created.id, deduplicated: true });
    expect((await adapter.getCandidate(created.id))?.lastName).toContain(runId);

    const note = await adapter.attachInterviewReport(created.id, { interviewId: runId, summary: "Nightly sandbox proof.", overallScore: 80, recommendation: "YES" }, { idempotencyKey: `sandbox-report:${runId}` });
    expect(note.deduplicated).toBe(false);

    const body = JSON.stringify({ action: "candidate_stage_change", payload: { application: { id: 1, candidate: { id: Number(created.id) }, jobs: [{ id: Number(open.id) }], current_stage: { name: "Phone Screen" }, updated_at: new Date().toISOString() } } });
    expect(await adapter.verifyWebhook({ headers: { Signature: `sha256 ${createHmac("sha256", webhookSecret).update(body).digest("hex")}` }, rawBody: body })).toBe(true);
    expect(adapter.parseWebhook(body)[0].type).toBe("candidate.stage_changed");
  }, 60_000);
});

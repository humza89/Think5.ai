import type { ATSAdapter, ATSConnectionConfig } from "../ats";
import { expectRejects, guard, type Violations } from "./shared";

export interface ATSHarness {
  create: () => ATSAdapter;
  config: ATSConnectionConfig;
  /** A request that `verifyWebhook` must accept, and one it must reject. */
  validWebhook: { headers: Record<string, string>; rawBody: string };
  invalidWebhook: { headers: Record<string, string>; rawBody: string };
}

/** Verifies connection gating, idempotent writes, capabilities and webhook verification. */
export async function runATSAdapterConformance(harness: ATSHarness): Promise<Violations> {
  const violations: Violations = [];

  await expectRejects(async () => {
    const adapter = harness.create();
    await adapter.listJobs();
  }, "listJobs before connect", violations);

  await guard(async () => {
    const adapter = harness.create();
    const caps = adapter.capabilities();
    for (const key of ["listJobs", "getCandidate", "upsertCandidate", "attachInterviewReport", "webhooks", "advanceStage", "reject"] as const) {
      if (typeof caps[key] !== "boolean") violations.push(`capabilities().${key} must be a boolean`);
    }
    const connection = await adapter.connect(harness.config);
    if (!connection.connected) violations.push(`connect must succeed with the harness config (${connection.detail ?? "no detail"})`);
    const bad = await adapter.connect({ ...harness.config, apiKey: "" });
    if (bad.connected) violations.push("connect must fail without an apiKey");
    await adapter.connect(harness.config);

    const jobs = await adapter.listJobs();
    if (!Array.isArray(jobs)) violations.push("listJobs must return an array");

    const first = await adapter.upsertCandidate(
      { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", jobIds: [] },
      { idempotencyKey: "upsert-1" },
    );
    if (!first.id || first.deduplicated) violations.push("first upsert must create and not be deduplicated");
    const replay = await adapter.upsertCandidate(
      { firstName: "Different", lastName: "Name", jobIds: [] },
      { idempotencyKey: "upsert-1" },
    );
    if (!replay.deduplicated || replay.id !== first.id) violations.push("replaying an idempotency key must return the original write and deduplicated=true");
    const fetched = await adapter.getCandidate(first.id);
    if (!fetched || fetched.firstName !== "Ada") violations.push("a replayed upsert must not modify the original candidate");
    if ((await adapter.getCandidate("does-not-exist")) !== null) violations.push("getCandidate must return null for unknown ids");

    const report = { interviewId: "int-1", summary: "Strong systems design." };
    const r1 = await adapter.attachInterviewReport(first.id, report, { idempotencyKey: "report-1" });
    const r2 = await adapter.attachInterviewReport(first.id, report, { idempotencyKey: "report-1" });
    if (r1.deduplicated || !r2.deduplicated) violations.push("attachInterviewReport must be idempotent per key");
  }, "connected adapter behaviour", violations);

  await expectRejects(async () => {
    const adapter = harness.create();
    await adapter.connect(harness.config);
    await adapter.upsertCandidate({ firstName: "No", lastName: "Key", jobIds: [] }, { idempotencyKey: "" });
  }, "upsertCandidate without idempotency key", violations);

  await guard(async () => {
    const adapter = harness.create();
    await adapter.connect(harness.config);
    if (!(await adapter.verifyWebhook(harness.validWebhook))) violations.push("verifyWebhook must accept a valid signature");
    if (await adapter.verifyWebhook(harness.invalidWebhook)) violations.push("verifyWebhook must reject an invalid signature");
    const events = adapter.parseWebhook(harness.validWebhook.rawBody);
    if (!Array.isArray(events)) violations.push("parseWebhook must return an array");
    for (const event of events) {
      if (!event.type || !event.providerEventId || Number.isNaN(Date.parse(event.occurredAt))) {
        violations.push("every ATSEvent needs type, providerEventId and an ISO occurredAt");
        break;
      }
    }
  }, "webhooks", violations);

  return violations;
}

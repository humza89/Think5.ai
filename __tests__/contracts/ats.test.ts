import { describe, expect, it } from "vitest";
import { InMemoryATSAdapter, type ATSAdapter, type ATSCandidateInput, type ATSWriteOptions, type ATSWriteResult } from "@/lib/contracts/ats";
import { runATSAdapterConformance } from "@/lib/contracts/conformance/ats";

const config = { provider: "greenhouse" as const, tenantId: "tenant-1", apiKey: "gh-key" };
const rawBody = JSON.stringify({ events: [{ type: "candidate.updated", providerEventId: "e1", occurredAt: "2026-09-01T00:00:00.000Z", payload: {} }] });

function harness(create: () => ATSAdapter) {
  return {
    create,
    config,
    validWebhook: { headers: { "x-ats-signature": `test-secret:${rawBody.length}` }, rawBody },
    invalidWebhook: { headers: { "x-ats-signature": "nope" }, rawBody },
  };
}

/** Broken on purpose: ignores idempotency keys, so retries create duplicates. */
class DuplicatingATSAdapter extends InMemoryATSAdapter {
  private counter = 0;
  async upsertCandidate(candidate: ATSCandidateInput, options: ATSWriteOptions): Promise<ATSWriteResult> {
    return super.upsertCandidate(candidate, { idempotencyKey: `${options.idempotencyKey}-${++this.counter}` });
  }
}

describe("ATSAdapter conformance", () => {
  it("InMemoryATSAdapter conforms", async () => {
    expect(await runATSAdapterConformance(harness(() => new InMemoryATSAdapter()))).toEqual([]);
  });

  it("detects an adapter that does not honour idempotency keys", async () => {
    const violations = await runATSAdapterConformance(harness(() => new DuplicatingATSAdapter()));
    expect(violations).toContain("replaying an idempotency key must return the original write and deduplicated=true");
  });

  it("exposes capabilities so the UI can grey out unsupported actions", () => {
    expect(new InMemoryATSAdapter().capabilities()).toMatchObject({ upsertCandidate: true, advanceStage: false, reject: false });
  });
});

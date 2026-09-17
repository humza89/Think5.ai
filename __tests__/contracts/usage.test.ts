import { describe, expect, it } from "vitest";
import { InMemoryUsageMeter, type UsageEvent, type UsageMeter, type UsageRecordResult } from "@/lib/contracts/usage";
import { runUsageMeterConformance } from "@/lib/contracts/conformance/usage";

/** Broken on purpose: counts replays and never validates. */
class DoubleCountingMeter implements UsageMeter {
  readonly events: UsageEvent[] = [];
  async record(event: UsageEvent): Promise<UsageRecordResult> {
    this.events.push(event);
    return { accepted: true, deduplicated: false };
  }
}

describe("UsageMeter conformance", () => {
  it("InMemoryUsageMeter conforms", async () => {
    expect(await runUsageMeterConformance(() => new InMemoryUsageMeter())).toEqual([]);
  });

  it("detects a meter that double-counts and skips validation", async () => {
    const violations = await runUsageMeterConformance(() => new DoubleCountingMeter());
    expect(violations).toContain("replaying an id must report deduplicated=true");
    expect(violations).toContain("record with wrong unit for kind: expected a rejection but the call succeeded");
  });

  it("is append-only: replays never change totals and snapshots are frozen", async () => {
    const meter = new InMemoryUsageMeter();
    const base: UsageEvent = {
      id: "e1",
      tenantId: "t",
      kind: "avatar.seconds",
      quantity: 30,
      unit: "seconds",
      occurredAt: "2026-09-01T00:00:00.000Z",
      subjectId: "i",
      source: "test",
    };
    await meter.record(base);
    await meter.record({ ...base, quantity: 1_000 });
    expect(meter.total("t", "avatar.seconds")).toBe(30);
    expect(() => {
      (meter.events()[0] as { quantity: number }).quantity = 5;
    }).toThrow();
  });
});

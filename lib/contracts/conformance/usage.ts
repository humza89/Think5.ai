import type { UsageEvent, UsageMeter } from "../usage";
import { UNIT_FOR_KIND, USAGE_KINDS } from "../usage";
import { expectRejects, guard, type Violations } from "./shared";

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    id: "evt-1",
    tenantId: "tenant-1",
    kind: "ai.tokens",
    quantity: 120,
    unit: "tokens",
    occurredAt: "2026-09-01T09:00:00.000Z",
    subjectId: "interview-1",
    source: "conformance",
    ...overrides,
  };
}

/** Verifies append-only, idempotent, validated recording for any UsageMeter. */
export async function runUsageMeterConformance(factory: () => UsageMeter): Promise<Violations> {
  const violations: Violations = [];
  const meter = factory();

  await guard(async () => {
    const first = await meter.record(event());
    if (!first.accepted || first.deduplicated) violations.push("first record must be accepted and not deduplicated");
    const replay = await meter.record(event({ quantity: 999 }));
    if (!replay.accepted) violations.push("replaying an id must still be accepted");
    if (!replay.deduplicated) violations.push("replaying an id must report deduplicated=true");
  }, "idempotent record", violations);

  await guard(async () => {
    let i = 0;
    for (const kind of USAGE_KINDS) {
      const result = await meter.record(event({ id: `evt-kind-${i++}`, kind, unit: UNIT_FOR_KIND[kind], quantity: 1 }));
      if (!result.accepted) violations.push(`record must accept kind ${kind}`);
    }
  }, "every kind accepted with its unit", violations);

  await expectRejects(() => meter.record(event({ id: "" })), "record without id", violations);
  await expectRejects(() => meter.record(event({ id: "evt-neg", quantity: -1 })), "record with negative quantity", violations);
  await expectRejects(() => meter.record(event({ id: "evt-unit", unit: "bytes" })), "record with wrong unit for kind", violations);
  await expectRejects(
    () => meter.record(event({ id: "evt-kind", kind: "nope" as unknown as "ai.tokens" })),
    "record with unknown kind",
    violations,
  );

  return violations;
}

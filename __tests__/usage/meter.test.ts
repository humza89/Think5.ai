import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaUsageMeter, recordUsage, setUsageMeterForTests } from "@/lib/usage/meter";
import { InMemoryTelemetry } from "@/lib/contracts/telemetry";
import { runUsageMeterConformance } from "@/lib/contracts/conformance/usage";

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    usageEvent: {
      async findUnique({ where }: { where: { id: string } }) { return rows.has(where.id) ? { id: where.id } : null; },
      async create({ data }: { data: Record<string, unknown> }) {
        if (rows.has(data.id as string)) { const e = new Error("unique") as Error & { code: string }; e.code = "P2002"; throw e; }
        rows.set(data.id as string, data);
        return data;
      },
    },
  };
}

describe("PrismaUsageMeter (T16)", () => {
  afterEach(() => { setUsageMeterForTests(null); vi.unstubAllEnvs(); });

  it("passes the T0.5 UsageMeter conformance runner", async () => {
    expect(await runUsageMeterConformance(() => new PrismaUsageMeter(fakeDb()))).toEqual([]);
  });

  it("records once, dedupes on the idempotency key even under a concurrent unique violation, and emits after a fresh write only", async () => {
    const db = fakeDb();
    const telemetry = new InMemoryTelemetry();
    const emitted: string[] = [];
    const meter = new PrismaUsageMeter(db, telemetry, async (e) => { emitted.push(e.id); });
    const event = { id: "interview:i1:completed", tenantId: "t1", kind: "interview.completed" as const, quantity: 1, unit: "count" as const, occurredAt: "2026-09-25T10:00:00.000Z", subjectId: "i1", source: "test" };
    expect(await meter.record(event)).toEqual({ accepted: true, deduplicated: false });
    expect(await meter.record(event)).toEqual({ accepted: true, deduplicated: true });
    // simulate a race: findUnique misses but create hits the unique index
    db.usageEvent.findUnique = async () => null;
    expect(await meter.record(event)).toEqual({ accepted: true, deduplicated: true });
    expect(db.rows.size).toBe(1);
    expect(db.rows.get(event.id)).toMatchObject({ subjectType: "interview", tenantId: "t1" });
    expect(emitted).toEqual([event.id]);
    expect(telemetry.counters.filter((c) => c.name === "usage.recorded")).toHaveLength(1);
  });

  it("recordUsage fills defaults, never throws, and honours FF_P0_USAGE_METERING", async () => {
    const db = fakeDb();
    setUsageMeterForTests(new PrismaUsageMeter(db));
    const result = await recordUsage({ id: "interview:i2:started", tenantId: null, kind: "interview.started", subjectId: "i2", source: "test" });
    expect(result).toEqual({ accepted: true, deduplicated: false });
    expect(db.rows.get("interview:i2:started")).toMatchObject({ tenantId: "unscoped", unit: "count", quantity: 1 });

    db.usageEvent.create = async () => { throw new Error("db down"); };
    db.usageEvent.findUnique = async () => null;
    expect(await recordUsage({ id: "x", tenantId: "t", kind: "interview.started", subjectId: "i3", source: "test" })).toBeNull();

    vi.stubEnv("FF_P0_USAGE_METERING", "false");
    expect(await recordUsage({ id: "y", tenantId: "t", kind: "interview.started", subjectId: "i4", source: "test" })).toBeNull();
    expect(db.rows.has("y")).toBe(false);
  });
});

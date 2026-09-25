import { describe, expect, it, vi } from "vitest";

vi.mock("@/inngest/client", () => ({ inngest: { createFunction: (cfg: unknown, fn: unknown) => ({ cfg, fn }), send: vi.fn() } }));
import { periodEnd, periodStart, recomputeAggregates, usageAggregate } from "@/lib/usage/aggregate";

describe("usage aggregation (T16)", () => {
  it("computes UTC day and month periods", () => {
    const at = new Date("2026-09-25T23:59:59.000Z");
    expect(periodStart("day", at).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(periodEnd("day", periodStart("day", at)).toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(periodStart("month", at).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(periodEnd("month", periodStart("month", at)).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("recomputes every touched period from the ledger and upserts idempotently", async () => {
    const events = [
      { tenantId: "t", kind: "ai.tokens", occurredAt: new Date("2026-09-25T10:00:00Z"), quantity: 100 },
      { tenantId: "t", kind: "ai.tokens", occurredAt: new Date("2026-09-25T11:00:00Z"), quantity: 50 },
      { tenantId: "t", kind: "ai.tokens", occurredAt: new Date("2026-09-24T11:00:00Z"), quantity: 7 },
    ];
    const upserts: Array<Record<string, unknown>> = [];
    const db = {
      usageEvent: {
        async findMany() { return events; },
        async aggregate({ where }: { where: { occurredAt: { gte: Date; lt: Date }; kind: string } }) {
          const inRange = events.filter((e) => e.kind === where.kind && e.occurredAt >= where.occurredAt.gte && e.occurredAt < where.occurredAt.lt);
          return { _sum: { quantity: inRange.reduce((s, e) => s + e.quantity, 0) }, _count: { _all: inRange.length } };
        },
      },
      usageAggregate: { async upsert(args: Record<string, unknown>) { upserts.push(args); return {}; } },
    };
    const first = await recomputeAggregates(db as never, new Date(0));
    const second = await recomputeAggregates(db as never, new Date(0));
    expect(first).toEqual({ periods: 3 }); // two days + one month
    expect(second).toEqual({ periods: 3 });
    const byKey = Object.fromEntries(upserts.slice(0, 3).map((u) => [`${(u.create as { period: string }).period}:${(u.create as { periodStart: Date }).periodStart.toISOString()}`, (u.create as { quantity: number; eventCount: number })]));
    expect(byKey["day:2026-09-25T00:00:00.000Z"]).toMatchObject({ quantity: 150, eventCount: 2 });
    expect(byKey["day:2026-09-24T00:00:00.000Z"]).toMatchObject({ quantity: 7, eventCount: 1 });
    expect(byKey["month:2026-09-01T00:00:00.000Z"]).toMatchObject({ quantity: 157, eventCount: 3 });
  });

  it("registers an hourly cron plus an on-demand trigger", () => {
    const { cfg } = usageAggregate as unknown as { cfg: { id: string; triggers: unknown[] } };
    expect(cfg.id).toBe("usage/aggregate");
    expect(cfg.triggers).toEqual([{ cron: "15 * * * *" }, { event: "usage/aggregate.requested" }]);
  });
});

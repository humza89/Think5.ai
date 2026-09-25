/**
 * Usage aggregation (Phase 0 T16). Pure period helpers plus an idempotent
 * rollup: every (tenant, kind, period) touched by recently recorded events
 * is recomputed from the immutable ledger and upserted, so repeated runs and
 * overlapping windows always converge on the same totals.
 */
import { inngest } from "@/inngest/client";

export type UsagePeriod = "day" | "month";

export function periodStart(period: UsagePeriod, at: Date): Date {
  if (period === "day") return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function periodEnd(period: UsagePeriod, start: Date): Date {
  if (period === "day") return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export interface AggregateDb {
  usageEvent: {
    findMany(args: { where: Record<string, unknown>; select: Record<string, boolean>; distinct?: string[]; take?: number }): Promise<Array<{ tenantId: string; kind: string; occurredAt: Date }>>;
    aggregate(args: { where: Record<string, unknown>; _sum: { quantity: true }; _count: { _all: true } }): Promise<{ _sum: { quantity: unknown }; _count: { _all: number } }>;
  };
  usageAggregate: {
    upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Recompute aggregates for every (tenant, kind, day, month) touched by events recorded since `since`. */
export async function recomputeAggregates(db: AggregateDb, since: Date, limit = 5000): Promise<{ periods: number }> {
  const touched = await db.usageEvent.findMany({
    where: { recordedAt: { gte: since } },
    select: { tenantId: true, kind: true, occurredAt: true },
    take: limit,
  });
  const keys = new Map<string, { tenantId: string; kind: string; period: UsagePeriod; start: Date }>();
  for (const row of touched) {
    for (const period of ["day", "month"] as UsagePeriod[]) {
      const start = periodStart(period, new Date(row.occurredAt));
      keys.set(`${row.tenantId}|${row.kind}|${period}|${start.toISOString()}`, { tenantId: row.tenantId, kind: row.kind, period, start });
    }
  }
  for (const key of keys.values()) {
    const end = periodEnd(key.period, key.start);
    const sum = await db.usageEvent.aggregate({
      where: { tenantId: key.tenantId, kind: key.kind, occurredAt: { gte: key.start, lt: end } },
      _sum: { quantity: true },
      _count: { _all: true },
    });
    const quantity = Number(sum._sum.quantity ?? 0);
    await db.usageAggregate.upsert({
      where: { tenantId_kind_period_periodStart: { tenantId: key.tenantId, kind: key.kind, period: key.period, periodStart: key.start } },
      create: { tenantId: key.tenantId, kind: key.kind, period: key.period, periodStart: key.start, quantity, eventCount: sum._count._all },
      update: { quantity, eventCount: sum._count._all },
    });
  }
  return { periods: keys.size };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const usageAggregate = inngest.createFunction(
  {
    id: "usage/aggregate",
    retries: 2,
    triggers: [{ cron: "15 * * * *" }, { event: "usage/aggregate.requested" }],
  },
  async ({ step }: any) => {
    const result = await step.run("recompute-recent", async () => {
      const { prisma } = await import("@/lib/prisma");
      // Look back two hours so a delayed or retried hour is always covered.
      return recomputeAggregates(prisma, new Date(Date.now() - 2 * 60 * 60 * 1000));
    });
    return result;
  }
);

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { periodEnd, periodStart } from "@/lib/usage/aggregate";

/**
 * GET /api/admin/usage?month=YYYY-MM (Phase 0 T16): per-tenant usage by kind
 * for the month from the immutable ledger, plus AI cost (from AIUsageLog,
 * the cost source of truth this phase) and cost per completed interview.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);
    const monthParam = request.nextUrl.searchParams.get("month");
    const base = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? new Date(`${monthParam}-01T00:00:00.000Z`) : new Date();
    const start = periodStart("month", base);
    const end = periodEnd("month", start);

    const [usage, cost] = await Promise.all([
      prisma.usageEvent.groupBy({
        by: ["tenantId", "kind"],
        where: { occurredAt: { gte: start, lt: end } },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ["companyId"],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { estimatedCost: true },
      }),
    ]);

    const tenants = new Map<string, { tenantId: string; kinds: Record<string, { quantity: number; events: number }>; aiCostUsd: number; costPerCompletedInterviewUsd: number | null }>();
    for (const row of usage as Array<{ tenantId: string; kind: string; _sum: { quantity: unknown }; _count: { _all: number } }>) {
      const entry = tenants.get(row.tenantId) ?? { tenantId: row.tenantId, kinds: {}, aiCostUsd: 0, costPerCompletedInterviewUsd: null };
      entry.kinds[row.kind] = { quantity: Number(row._sum.quantity ?? 0), events: row._count._all };
      tenants.set(row.tenantId, entry);
    }
    for (const row of cost as Array<{ companyId: string | null; _sum: { estimatedCost: number | null } }>) {
      const tenantId = row.companyId ?? "unscoped";
      const entry = tenants.get(tenantId) ?? { tenantId, kinds: {}, aiCostUsd: 0, costPerCompletedInterviewUsd: null };
      entry.aiCostUsd = row._sum.estimatedCost ?? 0;
      tenants.set(tenantId, entry);
    }
    for (const entry of tenants.values()) {
      const completed = entry.kinds["interview.completed"]?.quantity ?? 0;
      entry.costPerCompletedInterviewUsd = completed > 0 ? Number((entry.aiCostUsd / completed).toFixed(4)) : null;
    }

    return NextResponse.json({ period: { start: start.toISOString(), end: end.toISOString() }, tenants: [...tenants.values()] });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

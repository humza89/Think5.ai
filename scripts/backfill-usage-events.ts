/**
 * Phase 0 T16 backfill: historical interviews and AIUsageLog rows into the
 * immutable UsageEvent ledger, plus TenantQuota rows from Client.monthlyAiBudgetUsd.
 * Idempotent (ids derive from the subject) and resumable (bounded batches,
 * createMany with skipDuplicates).
 *
 *   npx tsx scripts/backfill-usage-events.ts [--batch 500] [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batch = Number(args[args.indexOf("--batch") + 1]) || 500;

async function backfillInterviews(): Promise<number> {
  let cursor: string | undefined;
  let written = 0;
  for (;;) {
    const rows = await prisma.interview.findMany({
      where: { OR: [{ startedAt: { not: null } }, { completedAt: { not: null } }] },
      select: { id: true, companyId: true, startedAt: true, completedAt: true },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    const data = rows.flatMap((i) => {
      const tenantId = i.companyId ?? "unscoped";
      const out = [];
      if (i.startedAt) out.push({ id: `interview:${i.id}:started`, tenantId, kind: "interview.started", quantity: 1, unit: "count", occurredAt: i.startedAt, subjectType: "interview", subjectId: i.id, source: "backfill" });
      if (i.completedAt) out.push({ id: `interview:${i.id}:completed`, tenantId, kind: "interview.completed", quantity: 1, unit: "count", occurredAt: i.completedAt, subjectType: "interview", subjectId: i.id, source: "backfill", metadata: { durationSeconds: i.startedAt ? Math.round((i.completedAt.getTime() - i.startedAt.getTime()) / 1000) : null } });
      return out;
    });
    if (!dryRun && data.length > 0) written += (await prisma.usageEvent.createMany({ data, skipDuplicates: true })).count;
    else written += data.length;
    cursor = rows[rows.length - 1].id;
    console.log(`[backfill] interviews: ${written} events so far`);
  }
  return written;
}

async function backfillAiUsage(): Promise<number> {
  let cursor: string | undefined;
  let written = 0;
  for (;;) {
    const rows = await prisma.aIUsageLog.findMany({ orderBy: { id: "asc" }, take: batch, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (rows.length === 0) break;
    const data = rows.map((l) => ({
      id: `ai:${l.id}`,
      tenantId: l.companyId ?? "unscoped",
      kind: "ai.tokens",
      quantity: l.inputTokens + l.outputTokens,
      unit: "tokens",
      occurredAt: l.createdAt,
      subjectType: "ai_call",
      subjectId: l.interviewId ?? l.id,
      source: `backfill:${l.operation}`,
      metadata: { model: l.model, operation: l.operation, inputTokens: l.inputTokens, outputTokens: l.outputTokens, estimatedCostUsd: l.estimatedCost },
    }));
    if (!dryRun) written += (await prisma.usageEvent.createMany({ data, skipDuplicates: true })).count;
    else written += data.length;
    cursor = rows[rows.length - 1].id;
    console.log(`[backfill] ai usage: ${written} events so far`);
  }
  return written;
}

async function backfillQuotas(): Promise<number> {
  const clients = await prisma.client.findMany({ where: { monthlyAiBudgetUsd: { not: null } }, select: { id: true, monthlyAiBudgetUsd: true } });
  let written = 0;
  for (const c of clients) {
    if (dryRun) { written++; continue; }
    await prisma.tenantQuota.upsert({
      where: { tenantId_feature: { tenantId: c.id, feature: "interview.create" } },
      create: { tenantId: c.id, feature: "interview.create", metric: "ai_cost_usd", limit: c.monthlyAiBudgetUsd!, window: "month", action: "block" },
      update: { limit: c.monthlyAiBudgetUsd! },
    });
    written++;
  }
  return written;
}

async function main(): Promise<void> {
  const interviews = await backfillInterviews();
  const ai = await backfillAiUsage();
  const quotas = await backfillQuotas();
  console.log(`[backfill] done: interview events ${interviews}, ai events ${ai}, quotas ${quotas}${dryRun ? " (dry run)" : ""}`);
}

main()
  .catch((error: unknown) => { console.error("[backfill] failed:", error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

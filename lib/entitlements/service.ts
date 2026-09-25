/**
 * Quota-backed EntitlementService (Phase 0 T16), implementing the T0.5 contract.
 *
 * A TenantQuota row per (tenant, feature) sets a limit over a window on a
 * metric: a usage kind (summed from the UsageEvent ledger) or "ai_cost_usd"
 * (the existing monthly AI spend computed from AIUsageLog, so the legacy
 * budget gate keeps identical behaviour). `warn` records and allows; `block`
 * denies with a structured reason. No quota row means allowed, except that a
 * Client.monthlyAiBudgetUsd still acts as an implicit `block` quota on
 * interview.create until the backfill script has materialised it.
 */
import { ENTITLEMENT_FEATURES, isEntitlementFeature, type EntitlementDecision, type EntitlementFeature, type EntitlementService } from "@/lib/contracts/entitlements";
import { NoopTelemetry, type Telemetry } from "@/lib/contracts/telemetry";
import { periodStart, type UsagePeriod } from "@/lib/usage/aggregate";

export const AI_COST_METRIC = "ai_cost_usd";

export interface QuotaRow {
  tenantId: string;
  feature: string;
  metric: string;
  limit: number | { toString(): string };
  window: string;
  action: string;
}

export interface EntitlementDb {
  tenantQuota: { findUnique(args: { where: { tenantId_feature: { tenantId: string; feature: string } } }): Promise<QuotaRow | null> };
  usageEvent: { aggregate(args: { where: Record<string, unknown>; _sum: { quantity: true } }): Promise<{ _sum: { quantity: unknown } }> };
  client: { findUnique(args: { where: { id: string }; select: { monthlyAiBudgetUsd: true } }): Promise<{ monthlyAiBudgetUsd: number | null } | null> };
}

export interface EntitlementDeps {
  db: EntitlementDb;
  /** Current monthly AI spend in USD for a tenant (legacy AIUsageLog source). */
  aiSpendUsd: (tenantId: string) => Promise<number>;
  telemetry?: Telemetry;
  now?: () => Date;
}

export class QuotaEntitlementService implements EntitlementService {
  private readonly telemetry: Telemetry;
  constructor(private readonly deps: EntitlementDeps) {
    this.telemetry = deps.telemetry ?? new NoopTelemetry();
  }

  private async resolveQuota(tenantId: string, feature: EntitlementFeature): Promise<QuotaRow | null> {
    const row = await this.deps.db.tenantQuota.findUnique({ where: { tenantId_feature: { tenantId, feature } } });
    if (row) return row;
    if (feature === "interview.create") {
      const client = await this.deps.db.client.findUnique({ where: { id: tenantId }, select: { monthlyAiBudgetUsd: true } });
      if (client?.monthlyAiBudgetUsd) {
        return { tenantId, feature, metric: AI_COST_METRIC, limit: client.monthlyAiBudgetUsd, window: "month", action: "block" };
      }
    }
    return null;
  }

  private async usedInWindow(tenantId: string, quota: QuotaRow): Promise<number> {
    if (quota.metric === AI_COST_METRIC) return this.deps.aiSpendUsd(tenantId);
    const now = (this.deps.now ?? (() => new Date()))();
    const period: UsagePeriod = quota.window === "day" ? "day" : "month";
    const start = periodStart(period, now);
    const sum = await this.deps.db.usageEvent.aggregate({ where: { tenantId, kind: quota.metric, occurredAt: { gte: start } }, _sum: { quantity: true } });
    return Number(sum._sum.quantity ?? 0);
  }

  async check(tenantId: string, feature: EntitlementFeature, quantity = 1): Promise<EntitlementDecision> {
    if (!tenantId) throw new Error("EntitlementService.check requires a tenantId");
    if (!isEntitlementFeature(feature)) throw new Error(`Unknown entitlement feature: ${String(feature)}`);
    if (!(quantity >= 0)) throw new Error("EntitlementService.check quantity must be >= 0");

    const telemetry = this.telemetry.withContext({ tenantId });
    const quota = await this.resolveQuota(tenantId, feature);
    if (!quota) {
      telemetry.counter("entitlements.check", 1, { feature, decision: "allow", policy: "unlimited" });
      return { allowed: true };
    }
    const limit = Number(quota.limit);
    const used = await this.usedInWindow(tenantId, quota);
    const remaining = Math.max(0, limit - used);
    // Cost quotas gate on spend already incurred; count quotas gate on the requested quantity.
    const exceeded = quota.metric === AI_COST_METRIC ? used > limit : used + quantity > limit;
    if (!exceeded) {
      telemetry.counter("entitlements.check", 1, { feature, decision: "allow", policy: quota.action });
      return { allowed: true, remaining };
    }
    if (quota.action === "warn") {
      telemetry.counter("entitlements.check", 1, { feature, decision: "allow", policy: "warn", exceeded: true });
      return { allowed: true, reason: "quota_exceeded_warn", remaining };
    }
    telemetry.counter("entitlements.check", 1, { feature, decision: "deny", policy: "block" });
    return { allowed: false, reason: "quota_exceeded", remaining };
  }
}

export { ENTITLEMENT_FEATURES };

let defaultService: QuotaEntitlementService | null = null;

export async function getEntitlementService(): Promise<QuotaEntitlementService> {
  if (defaultService) return defaultService;
  const { prisma } = await import("@/lib/prisma");
  const { checkBudgetThreshold } = await import("@/lib/ai-usage");
  defaultService = new QuotaEntitlementService({
    db: prisma,
    aiSpendUsd: async (tenantId) => (await checkBudgetThreshold(tenantId, { budgetUsd: Number.MAX_SAFE_INTEGER })).currentSpend,
  });
  return defaultService;
}

export function setEntitlementServiceForTests(service: QuotaEntitlementService | null): void {
  defaultService = service;
}

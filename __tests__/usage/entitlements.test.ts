import { describe, expect, it } from "vitest";
import { QuotaEntitlementService, type QuotaRow } from "@/lib/entitlements/service";
import { InMemoryTelemetry } from "@/lib/contracts/telemetry";
import { runEntitlementServiceConformance } from "@/lib/contracts/conformance/entitlements";

function service(opts: { quotas?: QuotaRow[]; usage?: Record<string, number>; budgets?: Record<string, number>; spend?: Record<string, number> } = {}) {
  const quotas = opts.quotas ?? [];
  return new QuotaEntitlementService({
    db: {
      tenantQuota: { async findUnique({ where }) { return quotas.find((q) => q.tenantId === where.tenantId_feature.tenantId && q.feature === where.tenantId_feature.feature) ?? null; } },
      usageEvent: { async aggregate({ where }) { return { _sum: { quantity: opts.usage?.[`${where.tenantId}|${where.kind}`] ?? 0 } }; } },
      client: { async findUnique({ where }) { const b = opts.budgets?.[where.id]; return b === undefined ? null : { monthlyAiBudgetUsd: b }; } },
    },
    aiSpendUsd: async (tenantId) => opts.spend?.[tenantId] ?? 0,
    telemetry: new InMemoryTelemetry(),
    now: () => new Date("2026-09-25T12:00:00.000Z"),
  });
}

describe("QuotaEntitlementService (T16)", () => {
  it("passes the T0.5 EntitlementService conformance runner", async () => {
    expect(await runEntitlementServiceConformance(() => service())).toEqual([]);
  });

  it("allows without a quota, blocks and warns on count quotas with remaining", async () => {
    const s = service({
      quotas: [
        { tenantId: "t", feature: "interview.create", metric: "interview.started", limit: 10, window: "month", action: "block" },
        { tenantId: "t", feature: "message.send", metric: "message.sent", limit: 5, window: "day", action: "warn" },
      ],
      usage: { "t|interview.started": 9, "t|message.sent": 5 },
    });
    expect(await s.check("t", "interview.create", 1)).toEqual({ allowed: true, remaining: 1 });
    expect(await s.check("t", "interview.create", 2)).toEqual({ allowed: false, reason: "quota_exceeded", remaining: 1 });
    expect(await s.check("t", "message.send", 1)).toEqual({ allowed: true, reason: "quota_exceeded_warn", remaining: 0 });
    expect(await s.check("t", "ats.sync")).toEqual({ allowed: true });
  });

  it("keeps the legacy AI budget behaviour: Client.monthlyAiBudgetUsd is an implicit block quota on interview.create", async () => {
    const under = service({ budgets: { t: 100 }, spend: { t: 40 } });
    expect(await under.check("t", "interview.create")).toEqual({ allowed: true, remaining: 60 });
    const over = service({ budgets: { t: 100 }, spend: { t: 120 } });
    expect(await over.check("t", "interview.create")).toEqual({ allowed: false, reason: "quota_exceeded", remaining: 0 });
    const materialised = service({ quotas: [{ tenantId: "t", feature: "interview.create", metric: "ai_cost_usd", limit: 100, window: "month", action: "block" }], spend: { t: 120 } });
    expect(await materialised.check("t", "interview.create")).toMatchObject({ allowed: false });
  });
});

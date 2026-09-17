import { describe, expect, it } from "vitest";
import { AllowAllEntitlements, InMemoryEntitlements, type EntitlementDecision, type EntitlementService } from "@/lib/contracts/entitlements";
import { InMemoryTelemetry } from "@/lib/contracts/telemetry";
import { runEntitlementServiceConformance } from "@/lib/contracts/conformance/entitlements";

/** Broken on purpose: denies without a reason and accepts any tenant. */
class SilentDenyEntitlements implements EntitlementService {
  async check(): Promise<EntitlementDecision> {
    return { allowed: false };
  }
}

describe("EntitlementService conformance", () => {
  it("AllowAllEntitlements conforms and logs a structured counter per check", async () => {
    const telemetry = new InMemoryTelemetry();
    expect(await runEntitlementServiceConformance(() => new AllowAllEntitlements(telemetry))).toEqual([]);
    const counters = telemetry.counters.filter((c) => c.name === "entitlements.check");
    expect(counters.length).toBeGreaterThan(0);
    expect(counters[0]).toMatchObject({ attributes: { decision: "allow", policy: "allow_all" }, context: { tenantId: "tenant-1" } });
  });

  it("InMemoryEntitlements conforms", async () => {
    expect(await runEntitlementServiceConformance(() => new InMemoryEntitlements(new InMemoryTelemetry()))).toEqual([]);
  });

  it("detects an implementation that denies without a reason or input validation", async () => {
    const violations = await runEntitlementServiceConformance(() => new SilentDenyEntitlements());
    expect(violations).toContain("check(interview.create) denied without a reason");
    expect(violations).toContain("check with empty tenantId: expected a rejection but the call succeeded");
  });

  it("InMemoryEntitlements enforces quotas and reports remaining", async () => {
    const service = new InMemoryEntitlements(new InMemoryTelemetry(), [{ tenantId: "t", feature: "interview.create", limit: 2 }]);
    expect(await service.check("t", "interview.create")).toEqual({ allowed: true, remaining: 1 });
    expect(await service.check("t", "interview.create")).toEqual({ allowed: true, remaining: 0 });
    expect(await service.check("t", "interview.create")).toEqual({ allowed: false, reason: "quota_exceeded", remaining: 0 });
    expect(await service.check("t", "ats.sync")).toEqual({ allowed: true });
  });
});

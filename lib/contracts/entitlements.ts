/**
 * EntitlementService contract (T0.5, quotas wired by T16, billing UI Phase 5).
 *
 * Every tenant-scoped action that consumes a metered capability asks this
 * service first. Phase 0 ships `AllowAllEntitlements`, which always allows
 * but records a structured telemetry event so the call sites are proven
 * before quotas exist.
 */
import type { Telemetry } from "./telemetry";

export const ENTITLEMENT_FEATURES = [
  "interview.create",
  "interview.avatar_minutes",
  "ats.sync",
  "api.key",
  "seat.recruiter",
  "message.send",
  "storage.bytes",
] as const;

export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[number];

export interface EntitlementDecision {
  allowed: boolean;
  /** Machine-readable reason when `allowed` is false (e.g. "quota_exceeded"). */
  reason?: string;
  /** Remaining quantity after this check, when the feature is quantified. */
  remaining?: number;
}

export interface EntitlementService {
  check(tenantId: string, feature: EntitlementFeature, quantity?: number): Promise<EntitlementDecision>;
}

export function isEntitlementFeature(value: string): value is EntitlementFeature {
  return (ENTITLEMENT_FEATURES as readonly string[]).includes(value);
}

/** Phase 0 default: allow everything, but never silently. */
export class AllowAllEntitlements implements EntitlementService {
  constructor(private readonly telemetry: Telemetry) {}

  async check(tenantId: string, feature: EntitlementFeature, quantity = 1): Promise<EntitlementDecision> {
    if (!tenantId) throw new Error("EntitlementService.check requires a tenantId");
    if (!isEntitlementFeature(feature)) throw new Error(`Unknown entitlement feature: ${String(feature)}`);
    if (!(quantity >= 0)) throw new Error("EntitlementService.check quantity must be >= 0");

    this.telemetry
      .withContext({ tenantId })
      .counter("entitlements.check", 1, { feature, quantity, decision: "allow", policy: "allow_all" });
    return { allowed: true };
  }
}

/**
 * Reference implementation with explicit quotas, used by the conformance
 * harness to prove call sites honour `allowed: false` and `remaining`.
 */
export class InMemoryEntitlements implements EntitlementService {
  private readonly quotas = new Map<string, number>();

  constructor(
    private readonly telemetry: Telemetry,
    quotas: Array<{ tenantId: string; feature: EntitlementFeature; limit: number }> = [],
  ) {
    for (const quota of quotas) this.quotas.set(`${quota.tenantId}:${quota.feature}`, quota.limit);
  }

  async check(tenantId: string, feature: EntitlementFeature, quantity = 1): Promise<EntitlementDecision> {
    if (!tenantId) throw new Error("EntitlementService.check requires a tenantId");
    if (!isEntitlementFeature(feature)) throw new Error(`Unknown entitlement feature: ${String(feature)}`);
    if (!(quantity >= 0)) throw new Error("EntitlementService.check quantity must be >= 0");

    const key = `${tenantId}:${feature}`;
    const remaining = this.quotas.get(key);
    const telemetry = this.telemetry.withContext({ tenantId });
    if (remaining === undefined) {
      telemetry.counter("entitlements.check", 1, { feature, quantity, decision: "allow", policy: "unlimited" });
      return { allowed: true };
    }
    if (quantity > remaining) {
      telemetry.counter("entitlements.check", 1, { feature, quantity, decision: "deny", policy: "quota" });
      return { allowed: false, reason: "quota_exceeded", remaining };
    }
    this.quotas.set(key, remaining - quantity);
    telemetry.counter("entitlements.check", 1, { feature, quantity, decision: "allow", policy: "quota" });
    return { allowed: true, remaining: remaining - quantity };
  }
}

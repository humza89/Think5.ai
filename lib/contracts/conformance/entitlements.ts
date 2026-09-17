import type { EntitlementService } from "../entitlements";
import { ENTITLEMENT_FEATURES } from "../entitlements";
import { expectRejects, guard, type Violations } from "./shared";

/**
 * Verifies that an EntitlementService validates its inputs and returns a
 * well-formed decision for every known feature. Quota behaviour is
 * implementation-specific and is asserted by the implementation's own tests.
 */
export async function runEntitlementServiceConformance(factory: () => EntitlementService): Promise<Violations> {
  const violations: Violations = [];
  const service = factory();

  await guard(async () => {
    for (const feature of ENTITLEMENT_FEATURES) {
      const decision = await service.check("tenant-1", feature, 1);
      if (typeof decision.allowed !== "boolean") violations.push(`check(${feature}) must return a boolean "allowed"`);
      if (!decision.allowed && !decision.reason) violations.push(`check(${feature}) denied without a reason`);
      if (decision.remaining !== undefined && !(decision.remaining >= 0)) {
        violations.push(`check(${feature}) returned a negative "remaining"`);
      }
    }
  }, "check over every feature", violations);

  await expectRejects(() => service.check("", "interview.create"), "check with empty tenantId", violations);
  await expectRejects(
    () => service.check("tenant-1", "not.a.feature" as unknown as "interview.create"),
    "check with unknown feature",
    violations,
  );
  await expectRejects(() => service.check("tenant-1", "interview.create", -1), "check with negative quantity", violations);

  return violations;
}

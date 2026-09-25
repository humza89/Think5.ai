import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decideMfaPolicy,
  generateRecoveryCodes,
  hashRecoveryCode,
  mfaEnforcementEnabled,
  mfaVerdict,
  normaliseRecoveryCode,
  resolveMfaPolicy,
  type MfaPolicyLookup,
} from "@/lib/mfa";

afterEach(() => vi.unstubAllEnvs());

describe("MFA policy (T9)", () => {
  it("is mandatory for admins and tenant admins, tenant-configurable for recruiters/HMs, optional for candidates", () => {
    expect(decideMfaPolicy("admin", {})).toEqual({ required: true, reason: "admin" });
    expect(decideMfaPolicy("recruiter", { isTenantAdmin: true })).toEqual({ required: true, reason: "tenant_admin" });
    expect(decideMfaPolicy("recruiter", { tenantRequiresMfa: true })).toEqual({ required: true, reason: "tenant_policy" });
    expect(decideMfaPolicy("hiring_manager", { tenantRequiresMfa: true })).toEqual({ required: true, reason: "tenant_policy" });
    expect(decideMfaPolicy("recruiter", {})).toEqual({ required: false, reason: "optional" });
    expect(decideMfaPolicy("hiring_manager", { isTenantAdmin: true })).toEqual({ required: false, reason: "optional" }); // flag is recruiter-only
    expect(decideMfaPolicy("candidate", { tenantRequiresMfa: true })).toEqual({ required: false, reason: "optional" });
  });

  it("resolves facts through the lookup only when needed", async () => {
    const calls: string[] = [];
    const lookup: MfaPolicyLookup = {
      async recruiter(id) { calls.push(`recruiter:${id}`); return { isTenantAdmin: false, companyId: "co-1" }; },
      async hiringManager(id) { calls.push(`hm:${id}`); return { companyId: "co-2" }; },
      async governance(companyId) { calls.push(`gov:${companyId}`); return { requireMfa: companyId === "co-2" }; },
    };
    expect(await resolveMfaPolicy({ id: "a", email: "a@x", role: "admin" }, lookup)).toMatchObject({ required: true });
    expect(await resolveMfaPolicy({ id: "c", email: "c@x", role: "candidate" }, lookup)).toMatchObject({ required: false });
    expect(calls).toEqual([]);
    expect(await resolveMfaPolicy({ id: "r", email: "r@x", role: "recruiter" }, lookup)).toEqual({ required: false, reason: "optional" });
    expect(await resolveMfaPolicy({ id: "h", email: "h@x", role: "hiring_manager" }, lookup)).toEqual({ required: true, reason: "tenant_policy" });
    expect(calls).toEqual(["recruiter:r", "gov:co-1", "hm:h", "gov:co-2"]);
  });

  it("verdict: enforcement off or not required passes; aal1 with a factor needs a challenge; no factor needs enrolment", () => {
    const required = { required: true, reason: "admin" } as const;
    expect(mfaVerdict(required, { currentLevel: "aal1", nextLevel: "aal2" }, false)).toEqual({ ok: true });
    expect(mfaVerdict({ required: false, reason: "optional" }, { currentLevel: "aal1", nextLevel: "aal1" }, true)).toEqual({ ok: true });
    expect(mfaVerdict(required, { currentLevel: "aal2", nextLevel: "aal2" }, true)).toEqual({ ok: true });
    expect(mfaVerdict(required, { currentLevel: "aal1", nextLevel: "aal2" }, true)).toMatchObject({ ok: false, code: "MFA_REQUIRED" });
    expect(mfaVerdict(required, { currentLevel: "aal1", nextLevel: "aal1" }, true)).toMatchObject({ ok: false, code: "MFA_ENROLLMENT_REQUIRED" });
    expect(mfaVerdict(required, { currentLevel: null, nextLevel: null }, true)).toMatchObject({ ok: false, code: "MFA_ENROLLMENT_REQUIRED" });
  });

  it("FF_P0_MFA_ENFORCEMENT defaults off", () => {
    vi.stubEnv("FF_P0_MFA_ENFORCEMENT", "");
    expect(mfaEnforcementEnabled()).toBe(false);
    vi.stubEnv("FF_P0_MFA_ENFORCEMENT", "true");
    expect(mfaEnforcementEnabled()).toBe(true);
    vi.stubEnv("FF_P0_MFA_ENFORCEMENT", "off");
    expect(mfaEnforcementEnabled()).toBe(false);
  });

  it("recovery codes are unambiguous, unique and hashed per user", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    expect(normaliseRecoveryCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(hashRecoveryCode("abcde-fghjk", "u1")).toBe(hashRecoveryCode("ABCDEFGHJK", "u1"));
    expect(hashRecoveryCode(codes[0], "u1")).not.toBe(hashRecoveryCode(codes[0], "u2"));
  });
});

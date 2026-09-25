/**
 * MFA policy and enforcement (Phase 0 T9) on Supabase native TOTP.
 *
 * Policy (Humza, 2026-09-16): mandatory for Think5 admins and for tenant
 * owners/admins (`Recruiter.isTenantAdmin`); tenant-configurable for other
 * recruiters and hiring managers (`GovernancePolicy.requireMfa`); optional
 * for candidates. Enforcement is server-side in `requireRole` (rejects an
 * `aal1` session where `aal2` is required) and mirrored by `MfaGate` in
 * `ProtectedRoute`. It is behind `FF_P0_MFA_ENFORCEMENT` (default off) so a
 * tenant can enrol its admins before the gate closes.
 *
 * Recovery codes: Supabase has no native recovery-code concept, so a code is
 * a one-time reset — presenting a valid code deletes the user's factors so
 * they can sign in at aal1 and enrol again. Codes are stored hashed.
 */
import { createHash, randomBytes } from "crypto";
import type { UserRole } from "@/types/supabase";

export type AssuranceLevel = "aal1" | "aal2";

export interface MfaPolicy {
  required: boolean;
  reason: "admin" | "tenant_admin" | "tenant_policy" | "optional";
}

export interface MfaPolicyLookup {
  /** For recruiters: tenant-admin flag and company id. */
  recruiter(userId: string, email: string): Promise<{ isTenantAdmin: boolean; companyId: string | null } | null>;
  /** For hiring managers: company id. */
  hiringManager(userId: string, email: string): Promise<{ companyId: string | null } | null>;
  /** Tenant policy for a company. */
  governance(companyId: string): Promise<{ requireMfa: boolean } | null>;
}

export interface ProfileLike {
  id: string;
  email: string;
  role: UserRole;
}

/** `FF_P0_MFA_ENFORCEMENT` (default off). */
export function mfaEnforcementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.FF_P0_MFA_ENFORCEMENT;
  if (raw === undefined || raw === "") return false;
  return ["true", "1", "on", "yes"].includes(raw.trim().toLowerCase());
}

/** Pure policy decision given what the lookup found. */
export function decideMfaPolicy(
  role: UserRole,
  facts: { isTenantAdmin?: boolean; tenantRequiresMfa?: boolean },
): MfaPolicy {
  if (role === "admin") return { required: true, reason: "admin" };
  if (role === "recruiter" && facts.isTenantAdmin) return { required: true, reason: "tenant_admin" };
  if ((role === "recruiter" || role === "hiring_manager") && facts.tenantRequiresMfa) return { required: true, reason: "tenant_policy" };
  return { required: false, reason: "optional" };
}

export async function resolveMfaPolicy(profile: ProfileLike, lookup: MfaPolicyLookup): Promise<MfaPolicy> {
  if (profile.role === "admin") return decideMfaPolicy("admin", {});
  if (profile.role === "candidate") return decideMfaPolicy("candidate", {});
  let isTenantAdmin = false;
  let companyId: string | null = null;
  if (profile.role === "recruiter") {
    const rec = await lookup.recruiter(profile.id, profile.email);
    isTenantAdmin = rec?.isTenantAdmin ?? false;
    companyId = rec?.companyId ?? null;
  } else {
    const hm = await lookup.hiringManager(profile.id, profile.email);
    companyId = hm?.companyId ?? null;
  }
  const tenantRequiresMfa = companyId ? (await lookup.governance(companyId))?.requireMfa ?? false : false;
  return decideMfaPolicy(profile.role, { isTenantAdmin, tenantRequiresMfa });
}

/** Prisma-backed lookup. Kept separate so the policy is unit-testable without a database. */
export function prismaMfaLookup(db: {
  recruiter: { findFirst(args: unknown): Promise<{ isTenantAdmin?: boolean; companyId: string | null } | null> };
  hiringManager?: { findFirst(args: unknown): Promise<{ companyId: string | null } | null> };
  governancePolicy: { findUnique(args: unknown): Promise<{ requireMfa?: boolean } | null> };
}): MfaPolicyLookup {
  return {
    async recruiter(userId, email) {
      const row = await db.recruiter.findFirst({
        where: { OR: [{ supabaseUserId: userId }, { email }] },
        select: { isTenantAdmin: true, companyId: true },
      });
      return row ? { isTenantAdmin: Boolean(row.isTenantAdmin), companyId: row.companyId } : null;
    },
    async hiringManager(userId, email) {
      if (!db.hiringManager) return null;
      try {
        const row = await db.hiringManager.findFirst({ where: { OR: [{ supabaseUserId: userId }, { email }] }, select: { companyId: true } });
        return row ? { companyId: row.companyId } : null;
      } catch {
        return null;
      }
    },
    async governance(companyId) {
      const row = await db.governancePolicy.findUnique({ where: { companyId }, select: { requireMfa: true } });
      return row ? { requireMfa: Boolean(row.requireMfa) } : null;
    },
  };
}

export type MfaVerdict =
  | { ok: true }
  | { ok: false; code: "MFA_REQUIRED" | "MFA_ENROLLMENT_REQUIRED"; message: string };

/**
 * Enforcement decision from the policy and the session's assurance level.
 * `nextLevel === "aal2"` means the user has a verified factor; `currentLevel`
 * is what this session actually proved.
 */
export function mfaVerdict(policy: MfaPolicy, aal: { currentLevel: AssuranceLevel | null; nextLevel: AssuranceLevel | null }, enforced: boolean): MfaVerdict {
  if (!enforced || !policy.required) return { ok: true };
  if (aal.nextLevel === "aal2" && aal.currentLevel === "aal2") return { ok: true };
  if (aal.nextLevel === "aal2") return { ok: false, code: "MFA_REQUIRED", message: "Two-factor verification required for this session" };
  return { ok: false, code: "MFA_ENROLLMENT_REQUIRED", message: "Two-factor authentication must be set up for this account" };
}

// ── Recovery codes ──────────────────────────────────────────────────────

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    const bytes = randomBytes(10);
    let code = "";
    for (let i = 0; i < 10; i++) code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string, userId: string): string {
  return createHash("sha256").update(`${userId}:${normaliseRecoveryCode(code)}`).digest("hex");
}

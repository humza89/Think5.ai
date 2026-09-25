/**
 * Server helpers for the MFA routes (Phase 0 T9). Thin wrappers over
 * Supabase `auth.mfa.*` on the user's cookie session plus the recovery-code
 * table. Routes stay small and testable.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, getAuthenticatedUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-log";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  mfaEnforcementEnabled,
  mfaVerdict,
  prismaMfaLookup,
  resolveMfaPolicy,
  type AssuranceLevel,
} from "@/lib/mfa";

export interface MfaStatus {
  enforced: boolean;
  required: boolean;
  reason: string;
  currentLevel: AssuranceLevel | null;
  nextLevel: AssuranceLevel | null;
  satisfied: boolean;
  factors: Array<{ id: string; type: string; friendlyName: string | null; status: string; createdAt: string }>;
  recoveryCodesRemaining: number;
}

export async function mfaStatusFor(session: Awaited<ReturnType<typeof getAuthenticatedUser>>): Promise<MfaStatus> {
  const { supabase, profile } = session;
  const p = profile as { id: string; email: string; role: "admin" | "candidate" | "recruiter" | "hiring_manager" };
  const [policy, aal, factors, remaining] = await Promise.all([
    resolveMfaPolicy(p, prismaMfaLookup(prisma)),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
    prisma.mfaRecoveryCode.count({ where: { userId: p.id, usedAt: null } }),
  ]);
  const enforced = mfaEnforcementEnabled();
  const currentLevel = (aal.data?.currentLevel ?? null) as AssuranceLevel | null;
  const nextLevel = (aal.data?.nextLevel ?? null) as AssuranceLevel | null;
  const verdict = mfaVerdict(policy, { currentLevel, nextLevel }, true);
  return {
    enforced,
    required: policy.required,
    reason: policy.reason,
    currentLevel,
    nextLevel,
    satisfied: verdict.ok,
    factors: (factors.data?.all ?? [])
      .filter((f) => f.status === "verified" || f.status === "unverified")
      .map((f) => ({ id: f.id, type: f.factor_type, friendlyName: f.friendly_name ?? null, status: f.status, createdAt: f.created_at })),
    recoveryCodesRemaining: remaining,
  };
}

/** Issue a fresh set of recovery codes (replaces any unused ones). Returns the plaintext codes once. */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId, usedAt: null } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code, userId) })) }),
  ]);
  return codes;
}

/**
 * Consume a recovery code: marks it used and deletes every factor so the
 * user can sign in at aal1 and enrol again. Returns false for an unknown or
 * used code.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const codeHash = hashRecoveryCode(code, userId);
  const updated = await prisma.mfaRecoveryCode.updateMany({ where: { userId, codeHash, usedAt: null }, data: { usedAt: new Date() } });
  if (updated.count !== 1) return false;
  const admin = await createSupabaseAdminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const factor of data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
  }
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId, usedAt: null } });
  return true;
}

export function mfaErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : "MFA request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function auditMfa(userId: string, role: string, action: string, metadata?: Record<string, unknown>): Promise<void> {
  await logActivity({ userId, userRole: role, action, entityType: "User", entityId: userId, metadata }).catch(() => {});
}

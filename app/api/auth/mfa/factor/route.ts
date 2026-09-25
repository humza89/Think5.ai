import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditMfa, issueRecoveryCodes, mfaErrorResponse, mfaStatusFor } from "@/lib/mfa-server";

/**
 * DELETE /api/auth/mfa/factor { factorId } — remove an authenticator (T9).
 * Requires an aal2 session when the account currently has a verified factor
 * (a stolen aal1 cookie must not be able to strip MFA).
 * POST /api/auth/mfa/factor { action: "regenerate-recovery-codes" } — new codes (aal2 required).
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    const { supabase, user, profile } = session;
    const body = await request.json().catch(() => ({}));
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) return NextResponse.json({ error: "factorId is required" }, { status: 400 });
    const status = await mfaStatusFor(session);
    if (status.nextLevel === "aal2" && status.currentLevel !== "aal2") {
      return NextResponse.json({ error: "Verify with your authenticator before changing two-factor settings", code: "MFA_REQUIRED" }, { status: 403 });
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const remaining = await supabase.auth.mfa.listFactors();
    if (!(remaining.data?.all ?? []).some((f) => f.status === "verified")) {
      await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id, usedAt: null } });
    }
    await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_unenrolled", { factorId });
    return NextResponse.json({ removed: true });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    const { user, profile } = session;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "regenerate-recovery-codes") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const status = await mfaStatusFor(session);
    if (status.nextLevel !== "aal2") return NextResponse.json({ error: "Set up an authenticator first", code: "MFA_ENROLLMENT_REQUIRED" }, { status: 400 });
    if (status.currentLevel !== "aal2") return NextResponse.json({ error: "Verify with your authenticator first", code: "MFA_REQUIRED" }, { status: 403 });
    const recoveryCodes = await issueRecoveryCodes(user.id);
    await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_recovery_codes_regenerated");
    return NextResponse.json({ recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

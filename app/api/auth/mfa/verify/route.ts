import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditMfa, issueRecoveryCodes, mfaErrorResponse } from "@/lib/mfa-server";

/**
 * POST /api/auth/mfa/verify { factorId, code } — complete enrolment (T9).
 * Verifies the first TOTP code, which also raises this session to aal2, and
 * returns the one-time recovery codes.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!factorId || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "factorId and a 6-digit code are required" }, { status: 400 });
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_verify_failed", { factorId });
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }
    const recoveryCodes = await issueRecoveryCodes(user.id);
    await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_enrolled", { factorId });
    return NextResponse.json({ verified: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

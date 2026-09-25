import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditMfa, mfaErrorResponse } from "@/lib/mfa-server";

/**
 * POST /api/auth/mfa/challenge { factorId?, code } — step-up an aal1 session
 * to aal2 with a TOTP code (T9). When factorId is omitted the first verified
 * TOTP factor is used.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "A 6-digit code is required" }, { status: 400 });
    let factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) {
      const { data } = await supabase.auth.mfa.listFactors();
      factorId = data?.totp?.find((f) => f.status === "verified")?.id ?? "";
    }
    if (!factorId) return NextResponse.json({ error: "No verified authenticator on this account", code: "MFA_ENROLLMENT_REQUIRED" }, { status: 400 });
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_challenge_failed", { factorId });
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_challenge_passed", { factorId });
    return NextResponse.json({ verified: true, currentLevel: aal?.currentLevel ?? "aal2" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

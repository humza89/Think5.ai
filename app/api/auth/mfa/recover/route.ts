import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditMfa, consumeRecoveryCode, mfaErrorResponse } from "@/lib/mfa-server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/recover { code } — use a one-time recovery code (T9).
 * Deletes the account's factors so the user can sign in at aal1 and enrol a
 * new authenticator. Rate limited per user.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const { allowed } = await checkRateLimit(`mfa-recover:${user.id}`, { maxRequests: 5, windowMs: 15 * 60_000 });
    if (!allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    if (code.replace(/[^A-Za-z0-9]/g, "").length < 8) return NextResponse.json({ error: "Recovery code required" }, { status: 400 });
    const ok = await consumeRecoveryCode(user.id, code);
    const role = (profile as { role: string }).role;
    if (!ok) {
      await auditMfa(user.id, role, "auth.mfa_recovery_failed");
      return NextResponse.json({ error: "Invalid or already used recovery code" }, { status: 400 });
    }
    await auditMfa(user.id, role, "auth.mfa_recovered");
    return NextResponse.json({ recovered: true, message: "Two-factor authentication was reset. Set up a new authenticator now." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditMfa, mfaErrorResponse } from "@/lib/mfa-server";

/**
 * POST /api/auth/mfa/enroll — start TOTP enrolment (T9).
 * Returns the factor id, the otpauth secret and a QR code (SVG data URL) from
 * Supabase. The factor is unverified until /verify succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const friendlyName = typeof body.friendlyName === "string" && body.friendlyName.trim() ? body.friendlyName.trim().slice(0, 64) : "Authenticator app";
    // Supabase rejects a second unverified factor with the same name; clear stale ones first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not start enrolment" }, { status: 400 });
    }
    await auditMfa(user.id, (profile as { role: string }).role, "auth.mfa_enroll_started", { factorId: data.id });
    return NextResponse.json({ factorId: data.id, type: data.type, secret: data.totp.secret, qrCode: data.totp.qr_code, uri: data.totp.uri }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}

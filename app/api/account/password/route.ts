import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/account/password { currentPassword, newPassword } (Phase 0 T9).
 * Re-authenticates with the current password on a throwaway client (no
 * cookies touched), then updates through the user's own session with
 * supabase.auth.updateUser. Sessions on other devices are signed out.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await getAuthenticatedUser();
    const { allowed } = await checkRateLimit(`password-change:${user.id}`, { maxRequests: 5, windowMs: 15 * 60_000 });
    if (!allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword) return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    if (newPassword === currentPassword) return NextResponse.json({ error: "New password must differ from the current password" }, { status: 400 });
    if (!user.email) return NextResponse.json({ error: "Account has no email" }, { status: 400 });

    const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: reauthError } = await verifier.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (reauthError) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});
    await logActivity({ userId: user.id, userRole: (profile as { role: string }).role, action: "account.password_changed", entityType: "User", entityId: user.id }).catch(() => {});
    return NextResponse.json({ updated: true, otherSessionsSignedOut: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

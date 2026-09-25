import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

/**
 * Sessions for the signed-in user (Phase 0 T9).
 * GET → the current session's facts (supabase-js exposes no per-session
 * admin listing, so this is honest about what it can show).
 * DELETE → sign out every other device (`scope: "others"`), keeping this one.
 */
export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const [{ data: sessionData }, { data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const session = sessionData.session;
    return NextResponse.json({
      current: {
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        assuranceLevel: aal?.currentLevel ?? null,
        authenticationMethods: (aal?.currentAuthenticationMethods ?? []).map((m) => ({ method: m.method, at: new Date(m.timestamp * 1000).toISOString() })),
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at,
        identities: (user.identities ?? []).map((i) => ({ provider: i.provider, lastSignInAt: i.last_sign_in_at ?? null })),
        verifiedFactors: (factors?.all ?? []).filter((f) => f.status === "verified").length,
      },
      note: "Per-device session listing is not exposed by Supabase Auth; use 'Sign out other devices' to revoke everything except this session.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  try {
    const { supabase, user, profile } = await getAuthenticatedUser();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logActivity({ userId: user.id, userRole: (profile as { role: string }).role, action: "account.other_sessions_revoked", entityType: "User", entityId: user.id }).catch(() => {});
    return NextResponse.json({ revoked: "others" });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

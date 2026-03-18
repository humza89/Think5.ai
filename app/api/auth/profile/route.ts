import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase-server";

export async function GET() {
  try {
    // 1. Validate session via anon client (reads cookies)
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ profile: null }, { status: 401 });
    }

    // 2. Fetch profile via admin client (bypasses RLS)
    const admin = await createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      // Profile row doesn't exist — create from auth metadata
      const meta = user.user_metadata || {};
      const { data: newProfile, error: createError } = await admin
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email!,
          first_name: meta.first_name || "",
          last_name: meta.last_name || "",
          role: meta.role || "candidate",
          email_verified: !!user.email_confirmed_at,
          avatar_url: meta.avatar_url || null,
        })
        .select("*")
        .single();

      if (createError || !newProfile) {
        return NextResponse.json(
          { profile: null, error: createError?.message || "Failed to create profile" },
          { status: 500 }
        );
      }

      return NextResponse.json({ profile: newProfile });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ profile: null }, { status: 500 });
  }
}

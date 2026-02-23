import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import type { UserRole } from "@/types/supabase";

const VALID_ROLES: UserRole[] = ["admin", "recruiter", "candidate", "hiring_manager"];

// PATCH /api/admin/users/[id] - Update user role or verification status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"]);

    const { id } = await params;
    const body = await request.json();
    const { role, email_verified } = body;

    // Validate inputs
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    if (email_verified !== undefined && typeof email_verified !== "boolean") {
      return NextResponse.json(
        { error: "email_verified must be a boolean" },
        { status: 400 }
      );
    }

    if (role === undefined && email_verified === undefined) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide role or email_verified." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Check user exists
    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role, email_verified")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (email_verified !== undefined) updateData.email_verified = email_verified;

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id)
      .select("id, email, first_name, last_name, role, email_verified, created_at, updated_at")
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

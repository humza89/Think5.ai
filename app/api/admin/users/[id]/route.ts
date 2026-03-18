import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import type { UserRole } from "@/types/supabase";

const VALID_ROLES: UserRole[] = ["admin", "recruiter", "candidate", "hiring_manager"];
const VALID_ACCOUNT_STATUSES = ["active", "suspended", "deactivated"] as const;

// PATCH /api/admin/users/[id] - Update user role, verification status, or account status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser, profile: adminProfile } = await requireRole(["admin"]);

    const { id } = await params;
    const body = await request.json();
    const { role, email_verified, account_status, reason } = body;

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

    if (account_status !== undefined && !VALID_ACCOUNT_STATUSES.includes(account_status)) {
      return NextResponse.json(
        { error: `Invalid account_status. Must be one of: ${VALID_ACCOUNT_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (role === undefined && email_verified === undefined && account_status === undefined) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide role, email_verified, or account_status." },
        { status: 400 }
      );
    }

    // Prevent admins from deactivating themselves
    if (account_status && account_status !== "active" && id === adminUser.id) {
      return NextResponse.json(
        { error: "Cannot suspend or deactivate your own account" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Check user exists
    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role, email_verified, account_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (email_verified !== undefined) updateData.email_verified = email_verified;
    if (account_status !== undefined) updateData.account_status = account_status;

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id)
      .select("id, email, first_name, last_name, role, email_verified, account_status, created_at, updated_at")
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }

    // Audit log for account status changes
    if (account_status !== undefined && account_status !== (existing as Record<string, unknown>).account_status) {
      console.log(
        `[Admin Audit] User ${adminProfile.email} (${adminUser.id}) changed account_status of ${existing.email} (${id}) from ${(existing as Record<string, unknown>).account_status} to ${account_status}. Reason: ${reason || "none"}`
      );
    }

    // Audit log for role changes
    if (role !== undefined && role !== existing.role) {
      console.log(
        `[Admin Audit] User ${adminProfile.email} (${adminUser.id}) changed role of ${existing.email} (${id}) from ${existing.role} to ${role}. Reason: ${reason || "none"}`
      );
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

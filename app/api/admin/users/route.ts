import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

// GET /api/admin/users - Paginated user list with search and role filter
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role") || "";

    const supabase = await createSupabaseAdminClient();

    // Build the query for counting
    let countQuery = supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Build the query for fetching
    let dataQuery = supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role, email_verified, created_at, updated_at");

    // Apply role filter
    if (role && ["admin", "recruiter", "candidate", "hiring_manager"].includes(role)) {
      countQuery = countQuery.eq("role", role as any);
      dataQuery = dataQuery.eq("role", role as any);
    }

    // Apply search filter (name or email)
    if (search) {
      const searchFilter = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }

    // Get total count
    const { count } = await countQuery;
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch paginated data
    const offset = (page - 1) * limit;
    const { data: users, error } = await dataQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    return NextResponse.json({
      users: users || [],
      total,
      page,
      totalPages,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

// GET /api/admin - Admin overview stats
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const [
      totalUsers,
      totalJobs,
      totalCandidates,
      totalInterviews,
      totalApplications,
      recentProfiles,
    ] = await Promise.all([
      prisma.recruiter.count(),
      prisma.job.count(),
      prisma.candidate.count(),
      prisma.interview.count(),
      prisma.application.count(),
      // Get recent user profiles from Supabase
      (async () => {
        try {
          const supabase = await createSupabaseAdminClient();
          const { data } = await supabase
            .from("profiles")
            .select("id, email, first_name, last_name, role, created_at, email_verified")
            .order("created_at", { ascending: false })
            .limit(20);
          return data || [];
        } catch {
          return [];
        }
      })(),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers,
        totalJobs,
        totalCandidates,
        totalInterviews,
        totalApplications,
      },
      recentProfiles,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

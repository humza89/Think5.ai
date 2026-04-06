import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

// GET /api/admin - Admin overview stats
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireRole(["admin"]);

    // Company-scoped admin: look up recruiter record to get companyId
    // Platform admins (no recruiter record) see everything
    const recruiter = await prisma.recruiter.findFirst({
      where: { email: profile.email },
      select: { companyId: true },
    });
    const companyFilter = recruiter?.companyId
      ? { companyId: recruiter.companyId }
      : {};

    const supabase = await createSupabaseAdminClient();

    const [
      totalJobs,
      totalCandidates,
      totalInterviews,
      totalApplications,
      pendingApprovals,
      profilesResult,
      roleCounts,
    ] = await Promise.all([
      prisma.job.count({ where: companyFilter }),
      prisma.candidate.count({ where: { recruiter: companyFilter.companyId ? { companyId: companyFilter.companyId } : undefined } }),
      prisma.interview.count({ where: companyFilter }),
      prisma.application.count({ where: { job: companyFilter.companyId ? { companyId: companyFilter.companyId } : undefined } }),
      prisma.candidate.count({
        where: {
          onboardingCompleted: true,
          onboardingStatus: "PENDING_APPROVAL",
          ...(companyFilter.companyId ? { recruiter: { companyId: companyFilter.companyId } } : {}),
        },
      }),
      // Get recent user profiles from Supabase
      (async () => {
        try {
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
      // Get user counts by role
      (async () => {
        try {
          const roles = ["admin", "recruiter", "candidate", "hiring_manager"] as const;
          const counts: Record<string, number> = {};
          let total = 0;

          for (const role of roles) {
            const { count } = await supabase
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .eq("role", role as any);
            counts[role] = count || 0;
            total += count || 0;
          }

          return { ...counts, total };
        } catch {
          return { admin: 0, recruiter: 0, candidate: 0, hiring_manager: 0, total: 0 };
        }
      })(),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers: roleCounts.total,
        totalJobs,
        totalCandidates,
        totalInterviews,
        totalApplications,
        pendingApprovals,
        usersByRole: {
          admin: roleCounts.admin,
          recruiter: roleCounts.recruiter,
          candidate: roleCounts.candidate,
          hiring_manager: roleCounts.hiring_manager,
        },
      },
      recentProfiles: profilesResult,
    });
  } catch (error) {
    console.error("[Admin API] Error:", error);
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message, detail: error instanceof Error ? error.message : String(error) }, { status });
  }
}

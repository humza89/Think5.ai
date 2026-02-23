import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["recruiter", "admin"]);

    const [
      totalJobs,
      activeJobs,
      totalApplications,
      totalInterviews,
      completedInterviews,
      totalCandidates,
      totalMatches,
      applicationsByStatus,
      interviewsByStatus,
      recentHires,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.application.count(),
      prisma.interview.count(),
      prisma.interview.count({ where: { status: "COMPLETED" } }),
      prisma.candidate.count(),
      prisma.match.count(),
      prisma.application.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.interview.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.application.count({ where: { status: "HIRED" } }),
    ]);

    // Compute funnel
    const findStatus = (arr: typeof applicationsByStatus, s: string) =>
      arr.find((a: any) => a.status === s)?._count.status || 0;

    const funnel = {
      applied: findStatus(applicationsByStatus, "APPLIED"),
      screening: findStatus(applicationsByStatus, "SCREENING"),
      interviewing: findStatus(applicationsByStatus, "INTERVIEWING"),
      shortlisted: findStatus(applicationsByStatus, "SHORTLISTED"),
      offered: findStatus(applicationsByStatus, "OFFERED"),
      hired: findStatus(applicationsByStatus, "HIRED"),
    };

    const interviewCompletion =
      totalInterviews > 0
        ? Math.round((completedInterviews / totalInterviews) * 100)
        : 0;

    return NextResponse.json({
      overview: {
        totalJobs,
        activeJobs,
        totalApplications,
        totalInterviews,
        completedInterviews,
        totalCandidates,
        totalMatches,
        recentHires,
        interviewCompletion,
      },
      funnel,
      applicationsByStatus: applicationsByStatus.map((a: any) => ({
        status: a.status,
        count: a._count.status,
      })),
      interviewsByStatus: interviewsByStatus.map((i: any) => ({
        status: i.status,
        count: i._count.status,
      })),
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

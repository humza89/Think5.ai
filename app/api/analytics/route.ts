import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["recruiter", "admin"]);

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const now = new Date();
    const endDate = endDateParam ? new Date(endDateParam) : now;
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30 days

    // Calculate the previous period of the same length for trend comparison
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate.getTime());

    const dateFilter = { gte: startDate, lte: endDate };
    const prevDateFilter = { gte: prevStart, lte: prevEnd };

    const [
      // Current period
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
      // Previous period for trends
      prevTotalApplications,
      prevActiveJobs,
      prevCompletedInterviews,
      prevTotalInterviews,
      prevRecentHires,
      // Time-series: applications grouped by date
      applicationsTimeSeries,
      // Interview scores for distribution
      interviewScores,
      // Average time-to-hire
      hiredApplications,
    ] = await Promise.all([
      // Current period counts
      prisma.job.count(),
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.application.count({ where: { appliedAt: dateFilter } }),
      prisma.interview.count({ where: { createdAt: dateFilter } }),
      prisma.interview.count({
        where: { status: "COMPLETED", createdAt: dateFilter },
      }),
      prisma.candidate.count(),
      prisma.match.count(),
      prisma.application.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { appliedAt: dateFilter },
      }),
      prisma.interview.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { createdAt: dateFilter },
      }),
      prisma.application.count({
        where: { status: "HIRED", appliedAt: dateFilter },
      }),

      // Previous period counts for trend calculation
      prisma.application.count({ where: { appliedAt: prevDateFilter } }),
      prisma.job.count({
        where: { status: "ACTIVE", createdAt: prevDateFilter },
      }),
      prisma.interview.count({
        where: { status: "COMPLETED", createdAt: prevDateFilter },
      }),
      prisma.interview.count({ where: { createdAt: prevDateFilter } }),
      prisma.application.count({
        where: { status: "HIRED", appliedAt: prevDateFilter },
      }),

      // Time-series: raw applications within period (we group in JS)
      prisma.application.findMany({
        where: { appliedAt: dateFilter },
        select: { appliedAt: true },
        orderBy: { appliedAt: "asc" },
      }),

      // Interview scores for distribution chart
      prisma.interview.findMany({
        where: {
          status: "COMPLETED",
          overallScore: { not: null },
          createdAt: dateFilter,
        },
        select: { overallScore: true },
      }),

      // Hired applications with their creation dates for time-to-hire
      prisma.application.findMany({
        where: {
          status: "HIRED",
          appliedAt: dateFilter,
        },
        select: {
          appliedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    // --- Compute funnel ---
    const findStatus = (
      arr: typeof applicationsByStatus,
      s: string
    ): number => {
      const found = arr.find((a: any) => a.status === s);
      return found ? found._count.status : 0;
    };

    const funnel = [
      { stage: "Applied", count: findStatus(applicationsByStatus, "APPLIED") },
      {
        stage: "Screening",
        count: findStatus(applicationsByStatus, "SCREENING"),
      },
      {
        stage: "Interview",
        count: findStatus(applicationsByStatus, "INTERVIEWING"),
      },
      { stage: "Offered", count: findStatus(applicationsByStatus, "OFFERED") },
      { stage: "Hired", count: findStatus(applicationsByStatus, "HIRED") },
    ];

    // --- Compute interview completion rate ---
    const interviewCompletion =
      totalInterviews > 0
        ? Math.round((completedInterviews / totalInterviews) * 100)
        : 0;

    const prevInterviewCompletion =
      prevTotalInterviews > 0
        ? Math.round((prevCompletedInterviews / prevTotalInterviews) * 100)
        : 0;

    // --- Compute average time-to-hire (in days) ---
    let avgTimeToHire = 0;
    if (hiredApplications.length > 0) {
      const totalDays = hiredApplications.reduce((sum: number, app: any) => {
        const diffMs = app.updatedAt.getTime() - app.appliedAt.getTime();
        return sum + diffMs / (1000 * 60 * 60 * 24);
      }, 0);
      avgTimeToHire = Math.round(totalDays / hiredApplications.length);
    }

    // --- Compute trends (percentage change vs previous period) ---
    const computeTrend = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const trends = {
      applications: computeTrend(totalApplications, prevTotalApplications),
      activeJobs: computeTrend(activeJobs, prevActiveJobs),
      interviewCompletion: computeTrend(
        interviewCompletion,
        prevInterviewCompletion
      ),
      hires: computeTrend(recentHires, prevRecentHires),
    };

    // --- Group applications by week/month for time-series ---
    const periodDays = periodMs / (1000 * 60 * 60 * 24);

    type TimeSeriesEntry = { period: string; count: number };
    const timeSeriesMap = new Map<string, number>();

    if (periodDays <= 31) {
      // Group by day for short periods
      for (const app of applicationsTimeSeries) {
        const day = app.appliedAt.toISOString().split("T")[0];
        timeSeriesMap.set(day, (timeSeriesMap.get(day) || 0) + 1);
      }
      // Fill gaps
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const key = cursor.toISOString().split("T")[0];
        if (!timeSeriesMap.has(key)) timeSeriesMap.set(key, 0);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // Group by week for longer periods
      for (const app of applicationsTimeSeries) {
        const d = app.appliedAt;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().split("T")[0];
        timeSeriesMap.set(key, (timeSeriesMap.get(key) || 0) + 1);
      }
      // Fill gaps (weekly)
      const cursor = new Date(startDate);
      cursor.setDate(cursor.getDate() - cursor.getDay());
      while (cursor <= endDate) {
        const key = cursor.toISOString().split("T")[0];
        if (!timeSeriesMap.has(key)) timeSeriesMap.set(key, 0);
        cursor.setDate(cursor.getDate() + 7);
      }
    }

    const applicationsOverTime: TimeSeriesEntry[] = Array.from(
      timeSeriesMap.entries()
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({
        period:
          periodDays <= 31
            ? new Date(period).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : `Wk ${new Date(period).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        count,
      }));

    // --- Interview score distribution ---
    const scoreBuckets = [
      { range: "0-20", min: 0, max: 20 },
      { range: "20-40", min: 20, max: 40 },
      { range: "40-60", min: 40, max: 60 },
      { range: "60-80", min: 60, max: 80 },
      { range: "80-100", min: 80, max: 101 },
    ];

    const scoreDistribution = scoreBuckets.map((bucket) => ({
      range: bucket.range,
      count: interviewScores.filter((s: any) => {
        const score = s.overallScore ?? 0;
        return score >= bucket.min && score < bucket.max;
      }).length,
    }));

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
        avgTimeToHire,
      },
      trends,
      funnel,
      applicationsOverTime,
      scoreDistribution,
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

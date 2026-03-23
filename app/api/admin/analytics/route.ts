import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { getUsageStats } from "@/lib/ai-usage";

/**
 * GET /api/admin/analytics — Enterprise analytics dashboard
 *
 * Returns:
 * - Interview volume and completion rates
 * - Score distribution and drift detection
 * - AI usage costs
 * - Quality metrics summary
 * - Fairness indicators (score distribution by interview type/mode)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const companyId = searchParams.get("companyId") || undefined;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const companyFilter = companyId ? { companyId } : {};

    // ── Interview Volume ──────────────────────────────────────────
    const [totalInterviews, completedInterviews, interviewsByType, interviewsByMode] = await Promise.all([
      prisma.interview.count({
        where: { createdAt: { gte: since }, ...companyFilter },
      }),
      prisma.interview.count({
        where: { createdAt: { gte: since }, status: "COMPLETED", ...companyFilter },
      }),
      prisma.interview.groupBy({
        by: ["type"],
        where: { createdAt: { gte: since }, ...companyFilter },
        _count: true,
      }),
      prisma.interview.groupBy({
        by: ["mode"],
        where: { createdAt: { gte: since }, ...companyFilter },
        _count: true,
      }),
    ]);

    // ── Score Distribution (Drift Detection) ─────────────────────
    const reports = await prisma.interviewReport.findMany({
      where: {
        createdAt: { gte: since },
        overallScore: { not: null },
      },
      select: {
        overallScore: true,
        recommendation: true,
        confidenceLevel: true,
        integrityScore: true,
        interview: {
          select: { type: true, mode: true },
        },
      },
    });

    type ReportRow = (typeof reports)[number];

    const scores = reports
      .map((r: ReportRow) => r.overallScore)
      .filter((s: number | null): s is number => s !== null);

    const avgScore = scores.length > 0
      ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
      : null;

    const scoreStdDev = scores.length > 1 && avgScore !== null
      ? Math.sqrt(
          scores.reduce((sum: number, s: number) => sum + Math.pow(s - avgScore, 2), 0) / scores.length
        )
      : null;

    // Score distribution by recommendation
    const recommendationDistribution = reports.reduce((acc: Record<string, number>, r: ReportRow) => {
      const rec = r.recommendation || "UNKNOWN";
      acc[rec] = (acc[rec] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Fairness: score distribution by interview type
    const scoresByType = reports.reduce((acc: Record<string, number[]>, r: ReportRow) => {
      const type = r.interview?.type || "UNKNOWN";
      if (!acc[type]) acc[type] = [];
      if (r.overallScore !== null) acc[type].push(r.overallScore);
      return acc;
    }, {} as Record<string, number[]>);

    const fairnessMetrics = Object.entries(scoresByType).map(([type, rawScores]) => {
      const typeScores = rawScores as number[];
      return {
        type,
        count: typeScores.length,
        avgScore: typeScores.reduce((a: number, b: number) => a + b, 0) / typeScores.length,
        minScore: Math.min(...typeScores),
        maxScore: Math.max(...typeScores),
      };
    });

    // ── AI Usage Costs ───────────────────────────────────────────
    let usageStats = null;
    try {
      usageStats = await getUsageStats({ companyId, since });
    } catch {
      // AI usage table may not exist yet
    }

    // ── Quality Metrics Summary ──────────────────────────────────
    let qualityMetrics = null;
    try {
      const metrics = await prisma.interviewQualityMetrics.findMany({
        where: { createdAt: { gte: since } },
        select: {
          depthScore: true,
          coveragePercentage: true,
          avgResponseDepth: true,
          followUpQuestions: true,
          totalQuestions: true,
          personalizationScore: true,
        },
      });

      if (metrics.length > 0) {
        const avg = (arr: (number | null)[]) => {
          const valid = arr.filter((v: number | null): v is number => v !== null);
          return valid.length > 0 ? valid.reduce((a: number, b: number) => a + b, 0) / valid.length : null;
        };

        type MetricRow = (typeof metrics)[number];
        qualityMetrics = {
          totalAssessed: metrics.length,
          avgDepthScore: avg(metrics.map((m: MetricRow) => m.depthScore)),
          avgCoverage: avg(metrics.map((m: MetricRow) => m.coveragePercentage)),
          avgResponseDepth: avg(metrics.map((m: MetricRow) => m.avgResponseDepth)),
          avgFollowUps: avg(metrics.map((m: MetricRow) => m.followUpQuestions)),
          avgPersonalization: avg(metrics.map((m: MetricRow) => m.personalizationScore)),
        };
      }
    } catch {
      // Quality metrics table may not exist yet
    }

    // ── Report Status Distribution ───────────────────────────────
    const reportStatuses = await prisma.interview.groupBy({
      by: ["reportStatus"],
      where: { createdAt: { gte: since }, ...companyFilter },
      _count: true,
    });

    // ── Integrity Overview ───────────────────────────────────────
    const integrityScores = reports
      .map((r: ReportRow) => r.integrityScore)
      .filter((s: number | null): s is number => s !== null);

    const avgIntegrityScore = integrityScores.length > 0
      ? integrityScores.reduce((a: number, b: number) => a + b, 0) / integrityScores.length
      : null;

    const lowIntegrityCount = integrityScores.filter((s: number) => s < 70).length;

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      volume: {
        total: totalInterviews,
        completed: completedInterviews,
        completionRate: totalInterviews > 0
          ? Math.round((completedInterviews / totalInterviews) * 100)
          : 0,
        byType: interviewsByType.map((t: { type: string; _count: number }) => ({
          type: t.type,
          count: t._count,
        })),
        byMode: interviewsByMode.map((m: { mode: string; _count: number }) => ({
          mode: m.mode,
          count: m._count,
        })),
      },
      scoring: {
        totalReports: reports.length,
        avgScore,
        scoreStdDev,
        recommendationDistribution,
        fairnessMetrics,
      },
      integrity: {
        avgScore: avgIntegrityScore,
        lowIntegrityCount,
        totalAssessed: integrityScores.length,
      },
      reportStatuses: reportStatuses.map((s: { reportStatus: string | null; _count: number }) => ({
        status: s.reportStatus,
        count: s._count,
      })),
      aiUsage: usageStats,
      quality: qualityMetrics,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

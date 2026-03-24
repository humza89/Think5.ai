import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { getUsageStats, checkBudgetThreshold } from "@/lib/ai-usage";

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

    // ── Cost Governance ─────────────────────────────────────────
    let costGovernance = null;
    try {
      if (companyId) {
        costGovernance = await checkBudgetThreshold(companyId);
      } else {
        // Get per-company cost breakdown for admin overview
        const companyCosts = await prisma.aIUsageLog.groupBy({
          by: ["companyId"],
          where: { createdAt: { gte: since }, companyId: { not: null } },
          _sum: { estimatedCost: true },
          _count: true,
        });

        type CostRow = (typeof companyCosts)[number];
        costGovernance = {
          perCompany: companyCosts.map((c: CostRow) => ({
            companyId: c.companyId,
            totalCost: c._sum.estimatedCost || 0,
            operationCount: c._count,
          })),
        };
      }
    } catch {
      // AI usage table may not exist yet
    }

    // ── Section-Level Analytics ──────────────────────────────────
    let sectionAnalytics = null;
    try {
      const sections = await prisma.interviewSection.groupBy({
        by: ["sectionName"],
        where: { createdAt: { gte: since } },
        _avg: { coverageScore: true },
        _count: true,
      });

      if (sections.length > 0) {
        type SectionRow = (typeof sections)[number];
        sectionAnalytics = sections.map((s: SectionRow) => ({
          sectionName: s.sectionName,
          avgCoverageScore: s._avg.coverageScore,
          totalInterviews: s._count,
        }));
      }
    } catch {
      // InterviewSection table may not exist yet
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

    // ── Time-Series Drift Detection ──────────────────────────────
    // Compare rolling 7-day average vs 30-day baseline
    let driftAnalysis = null;
    if (scores.length >= 10) {
      const recentReports = reports
        .filter((r: ReportRow) => r.overallScore !== null)
        .sort((a: ReportRow, b: ReportRow) =>
          // Most recent reports first — not guaranteed order from DB
          0
        );

      const recent7d = new Date();
      recent7d.setDate(recent7d.getDate() - 7);

      const last7dScores = scores.slice(0, Math.ceil(scores.length * (7 / days)));
      const baselineScores = scores;

      const last7dAvg = last7dScores.length > 0
        ? last7dScores.reduce((a: number, b: number) => a + b, 0) / last7dScores.length
        : null;
      const baselineAvg = avgScore;

      const driftPercent = last7dAvg !== null && baselineAvg !== null && baselineAvg !== 0
        ? Math.round(((last7dAvg - baselineAvg) / baselineAvg) * 100 * 10) / 10
        : null;

      const driftSeverity = driftPercent !== null
        ? Math.abs(driftPercent) > 15 ? "HIGH"
          : Math.abs(driftPercent) > 8 ? "MEDIUM"
          : "LOW"
        : null;

      driftAnalysis = {
        last7dAvg: last7dAvg !== null ? Math.round(last7dAvg * 10) / 10 : null,
        baselineAvg: baselineAvg !== null ? Math.round(baselineAvg * 10) / 10 : null,
        driftPercent,
        driftSeverity,
        sampleSize: { recent: last7dScores.length, baseline: baselineScores.length },
      };
    }

    // ── Evidence Density Metrics ──────────────────────────────────
    let evidenceDensity = null;
    try {
      const interviewsWithTranscripts = await prisma.interview.findMany({
        where: { createdAt: { gte: since }, status: "COMPLETED", ...companyFilter },
        select: {
          transcript: true,
          sections: { select: { questionsAsked: true } },
        },
        take: 100,
      });

      if (interviewsWithTranscripts.length > 0) {
        type TranscriptRow = { transcript: unknown; sections: { questionsAsked: number }[] };
        const transcriptLengths = interviewsWithTranscripts
          .map((i: TranscriptRow) => {
            const t = i.transcript as unknown[];
            return Array.isArray(t) ? t.length : 0;
          })
          .filter((l: number) => l > 0);

        const questionCounts = interviewsWithTranscripts
          .map((i: TranscriptRow) => i.sections.reduce((sum: number, s: { questionsAsked: number }) => sum + s.questionsAsked, 0))
          .filter((c: number) => c > 0);

        evidenceDensity = {
          avgTranscriptLength: transcriptLengths.length > 0
            ? Math.round(transcriptLengths.reduce((a: number, b: number) => a + b, 0) / transcriptLengths.length)
            : null,
          avgQuestionCount: questionCounts.length > 0
            ? Math.round(questionCounts.reduce((a: number, b: number) => a + b, 0) / questionCounts.length)
            : null,
          sampleSize: interviewsWithTranscripts.length,
        };
      }
    } catch {
      // Non-critical
    }

    // ── Score by Mode (Fairness) ──────────────────────────────────
    const scoresByMode = reports.reduce((acc: Record<string, number[]>, r: ReportRow) => {
      const mode = r.interview?.mode || "UNKNOWN";
      if (!acc[mode]) acc[mode] = [];
      if (r.overallScore !== null) acc[mode].push(r.overallScore);
      return acc;
    }, {} as Record<string, number[]>);

    const fairnessByMode = Object.entries(scoresByMode).map(([mode, modeScores]) => {
      const ms = modeScores as number[];
      return {
        mode,
        count: ms.length,
        avgScore: Math.round((ms.reduce((a: number, b: number) => a + b, 0) / ms.length) * 10) / 10,
        minScore: Math.min(...ms),
        maxScore: Math.max(...ms),
      };
    });

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
      costGovernance,
      quality: qualityMetrics,
      sectionAnalytics,
      driftAnalysis,
      evidenceDensity,
      fairnessByMode,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

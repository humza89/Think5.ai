import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const reports = await prisma.interviewReport.findMany({
      where,
      select: {
        overallScore: true,
        recommendation: true,
        scorerModelVersion: true,
        createdAt: true,
        interview: {
          select: { type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by model version
    const byModel: Record<string, { scores: number[]; recommendations: Record<string, number>; count: number }> = {};
    // Group by interview type
    const byType: Record<string, { scores: number[]; count: number }> = {};
    // Overall distribution
    const distribution = { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };

    for (const report of reports) {
      const model = report.scorerModelVersion || "unknown";
      const type = report.interview.type;
      const score = report.overallScore;

      // By model
      if (!byModel[model]) byModel[model] = { scores: [], recommendations: {}, count: 0 };
      byModel[model].count++;
      if (score != null) byModel[model].scores.push(score);
      if (report.recommendation) {
        byModel[model].recommendations[report.recommendation] =
          (byModel[model].recommendations[report.recommendation] || 0) + 1;
      }

      // By type
      if (!byType[type]) byType[type] = { scores: [], count: 0 };
      byType[type].count++;
      if (score != null) byType[type].scores.push(score);

      // Distribution
      if (score != null) {
        if (score < 20) distribution["0-20"]++;
        else if (score < 40) distribution["20-40"]++;
        else if (score < 60) distribution["40-60"]++;
        else if (score < 80) distribution["60-80"]++;
        else distribution["80-100"]++;
      }
    }

    // Compute stats per group
    const computeStats = (scores: number[]) => {
      if (scores.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
      const sorted = [...scores].sort((a, b) => a - b);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      return {
        mean: Math.round(mean * 10) / 10,
        median,
        stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    };

    const modelStats = Object.entries(byModel).map(([model, data]) => ({
      model,
      count: data.count,
      ...computeStats(data.scores),
      recommendations: data.recommendations,
    }));

    const typeStats = Object.entries(byType).map(([type, data]) => ({
      type,
      count: data.count,
      ...computeStats(data.scores),
    }));

    return NextResponse.json({
      totalReports: reports.length,
      distribution,
      byModel: modelStats,
      byType: typeStats,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

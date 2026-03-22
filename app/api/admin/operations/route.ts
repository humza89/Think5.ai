import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const dateFilter: Record<string, unknown> = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const [
      // Report generation status
      reportsByStatus,
      // Voice provider distribution
      byVoiceProvider,
      // Recording pipeline state
      byRecordingState,
      // Total interviews
      totalInterviews,
      completedInterviews,
      failedReports,
      // Proctoring events by severity
      proctoringBySeverity,
      // Retry counts
      retriedReports,
      // Interviews with missing transcripts (completed but no transcript)
      incompleteTranscripts,
    ] = await Promise.all([
      prisma.interview.groupBy({
        by: ["reportStatus"],
        _count: { reportStatus: true },
        where: { ...dateFilter },
      }),
      prisma.interview.groupBy({
        by: ["voiceProvider"],
        _count: { voiceProvider: true },
        where: { status: "COMPLETED", ...dateFilter },
      }),
      prisma.interview.groupBy({
        by: ["recordingState"],
        _count: { recordingState: true },
        where: { recordingState: { not: null }, ...dateFilter },
      }),
      prisma.interview.count({ where: { ...dateFilter } }),
      prisma.interview.count({ where: { status: "COMPLETED", ...dateFilter } }),
      prisma.interview.count({
        where: { reportStatus: "failed", ...dateFilter },
      }),
      prisma.proctoringEvent.groupBy({
        by: ["severity"],
        _count: { severity: true },
        ...(startDate || endDate
          ? {
              where: {
                timestamp: {
                  ...(startDate && { gte: new Date(startDate) }),
                  ...(endDate && { lte: new Date(endDate) }),
                },
              },
            }
          : {}),
      }),
      prisma.interview.count({
        where: { reportRetryCount: { gt: 0 }, ...dateFilter },
      }),
      prisma.interview.count({
        where: {
          status: "COMPLETED",
          transcript: null,
          ...dateFilter,
        },
      }),
    ]);

    // Compute report generation success rate
    const completedReports = reportsByStatus.find(
      (r: { reportStatus: string | null }) => r.reportStatus === "completed"
    )?._count.reportStatus ?? 0;
    const totalReportsAttempted = completedReports + failedReports;
    const reportSuccessRate =
      totalReportsAttempted > 0
        ? Math.round((completedReports / totalReportsAttempted) * 100)
        : 100;

    // Completion rate
    const completionRate =
      totalInterviews > 0
        ? Math.round((completedInterviews / totalInterviews) * 100)
        : 0;

    return NextResponse.json({
      overview: {
        totalInterviews,
        completedInterviews,
        completionRate,
        reportSuccessRate,
        failedReports,
        retriedReports,
        incompleteTranscripts,
      },
      reportStatus: reportsByStatus.map((r: any) => ({
        status: r.reportStatus || "unknown",
        count: r._count.reportStatus,
      })),
      voiceProviders: byVoiceProvider.map((v: any) => ({
        provider: v.voiceProvider || "unknown",
        count: v._count.voiceProvider,
      })),
      recordingPipeline: byRecordingState.map((r: any) => ({
        state: r.recordingState || "unknown",
        count: r._count.recordingState,
      })),
      proctoringEvents: proctoringBySeverity.map((p: any) => ({
        severity: p.severity,
        count: p._count.severity,
      })),
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

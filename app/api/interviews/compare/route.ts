/**
 * Comparative Candidate Ranking — ranks candidates within a job requisition.
 */

import { NextRequest } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin", "recruiter", "hiring_manager"]);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const sortBy = searchParams.get("sortBy") || "overallScore";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const interviews = await prisma.interview.findMany({
      where: { jobId, status: "REPORT_READY" },
      include: {
        candidate: { select: { id: true, fullName: true, email: true } },
        report: {
          select: {
            overallScore: true, recommendation: true, confidenceLevel: true,
            domainExpertise: true, communicationScore: true, problemSolving: true,
            professionalExperience: true, thinkingJudgment: true, roleFit: true,
            culturalFit: true, strengths: true, riskSignals: true, continuityGrade: true,
          },
        },
      },
      take: limit,
    });

    const validSortFields = [
      "overallScore", "domainExpertise", "communicationScore",
      "problemSolving", "professionalExperience", "roleFit",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "overallScore";

    const ranked = interviews
      .filter(i => i.report)
      .map(interview => ({
        candidateId: interview.candidate?.id,
        candidateName: interview.candidate?.fullName,
        interviewId: interview.id,
        completedAt: interview.completedAt,
        recommendation: interview.report!.recommendation,
        confidenceLevel: interview.report!.confidenceLevel,
        scores: {
          overall: interview.report!.overallScore,
          domain: interview.report!.domainExpertise,
          communication: interview.report!.communicationScore,
          problemSolving: interview.report!.problemSolving,
          experience: interview.report!.professionalExperience,
          thinking: interview.report!.thinkingJudgment,
          roleFit: interview.report!.roleFit,
          culturalFit: interview.report!.culturalFit,
        },
        strengths: interview.report!.strengths,
        riskSignals: interview.report!.riskSignals,
      }))
      .sort((a, b) => {
        const key = sortField === "overallScore" ? "overall" : sortField;
        const aScore = (a.scores as Record<string, unknown>)[key] as number ?? 0;
        const bScore = (b.scores as Record<string, unknown>)[key] as number ?? 0;
        return bScore - aScore;
      })
      .map((candidate, index) => ({ rank: index + 1, ...candidate }));

    return Response.json({ success: true, jobId, totalCandidates: ranked.length, sortedBy: sortField, rankings: ranked });
  } catch {
    return Response.json({ error: "Failed to generate rankings" }, { status: 500 });
  }
}

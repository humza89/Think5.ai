import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError, AuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile } = await getAuthenticatedUser();

    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const { id } = await params;

    const interview = await prisma.interview.findFirst({
      where: {
        id,
        invitedEmail: { equals: profile.email, mode: "insensitive" },
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
        invitedEmail: true,
        transcript: true,
        templateSnapshot: true,
        candidate: {
          select: {
            fullName: true,
            currentTitle: true,
          },
        },
        report: true,
      },
    });

    if (!interview) {
      throw new AuthError("Interview not found", 404);
    }

    if (!interview.report) {
      throw new AuthError("Report not yet available", 404);
    }

    // Apply candidate report visibility policy from template snapshot
    const templateConfig = (interview as any).templateSnapshot || {};
    const policy = templateConfig.candidateReportPolicy as Record<string, boolean> | null;
    // Defaults: show strengths, hide everything else
    const showScores = policy?.showScores === true;
    const showStrengths = policy?.showStrengths !== false; // default true
    const showAreasToImprove = policy?.showAreasToImprove === true;
    const showTranscript = policy?.showTranscript === true;

    return NextResponse.json({
      report: {
        // Scores only if policy allows
        overallScore: showScores ? interview.report.overallScore : null,
        recommendation: showScores ? interview.report.recommendation : null,
        summary: interview.report.summary, // always shown
        technicalSkills: showScores ? interview.report.technicalSkills : null,
        softSkills: showScores ? interview.report.softSkills : null,
        domainExpertise: showScores ? interview.report.domainExpertise : null,
        clarityStructure: showScores ? interview.report.clarityStructure : null,
        problemSolving: showScores ? interview.report.problemSolving : null,
        communicationScore: showScores ? interview.report.communicationScore : null,
        measurableImpact: showScores ? interview.report.measurableImpact : null,
        strengths: showStrengths ? interview.report.strengths : null,
        areasToImprove: showAreasToImprove ? interview.report.areasToImprove : null,
        // Always excluded: hiringAdvice, integrity, risk signals, hypothesis outcomes
        // Phase 1 fields — scores-gated
        headline: interview.report.headline, // always shown (summary-like)
        confidenceLevel: null, // recruiter-only
        professionalExperience: showScores ? interview.report.professionalExperience : null,
        roleFit: showScores ? interview.report.roleFit : null,
        culturalFit: showScores ? interview.report.culturalFit : null,
        thinkingJudgment: showScores ? interview.report.thinkingJudgment : null,
        riskSignals: null, // recruiter-only
        hypothesisOutcomes: null, // recruiter-only
        evidenceHighlights: null, // recruiter-only
        jobMatchScore: null, // recruiter-only
        requirementMatches: null, // recruiter-only
        environmentFitNotes: null, // recruiter-only
        integrityScore: null, // never shown to candidate
        integrityFlags: null, // never shown to candidate
        hiringAdvice: null, // never shown to candidate
        reviewStatus: interview.report.reviewStatus,
      },
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      interviewType: interview.type,
      interviewDate: interview.createdAt.toISOString(),
      ...(showTranscript && interview.transcript ? { transcript: interview.transcript } : {}),
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

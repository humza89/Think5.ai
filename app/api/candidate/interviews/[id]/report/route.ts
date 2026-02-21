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
      include: {
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

    return NextResponse.json({
      report: {
        overallScore: interview.report.overallScore,
        recommendation: interview.report.recommendation,
        summary: interview.report.summary,
        technicalSkills: interview.report.technicalSkills,
        softSkills: interview.report.softSkills,
        domainExpertise: interview.report.domainExpertise,
        clarityStructure: interview.report.clarityStructure,
        problemSolving: interview.report.problemSolving,
        communicationScore: interview.report.communicationScore,
        measurableImpact: interview.report.measurableImpact,
        strengths: interview.report.strengths,
        areasToImprove: interview.report.areasToImprove,
        // Exclude hiringAdvice — recruiter-only
        integrityScore: interview.report.integrityScore,
        integrityFlags: interview.report.integrityFlags,
      },
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      interviewType: interview.type,
      interviewDate: interview.createdAt.toISOString(),
      transcript: interview.transcript,
      integrityEvents: interview.integrityEvents,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

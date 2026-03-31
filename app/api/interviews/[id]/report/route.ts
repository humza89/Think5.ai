import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireInterviewAccess,
  handleAuthError,
  getAuthenticatedUser,
} from "@/lib/auth";
import { SCORER_MODEL_VERSION, getScorerPromptHash } from "@/lib/gemini";
import { getSkillModulesHash } from "@/lib/skill-modules";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// GET - Get the report for an interview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    // Audit trail: log report view
    const { user, profile } = await getAuthenticatedUser();
    logInterviewActivity({
      interviewId: id,
      action: "report.viewed",
      userId: user.id,
      userRole: profile.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    // All InterviewReport fields (including memoryIntegrityScorecard) are returned
    // via findUnique + include. No explicit select needed on the report model.
    const report = await prisma.interviewReport.findUnique({
      where: { interviewId: id },
      include: {
        interview: {
          select: {
            id: true,
            candidateId: true,
            status: true,
            type: true,
            duration: true,
            overallScore: true,
            startedAt: true,
            completedAt: true,
            candidate: {
              select: {
                id: true,
                fullName: true,
                currentTitle: true,
                currentCompany: true,
              },
            },
            template: {
              select: { isShadow: true },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Report not found for this interview" },
        { status: 404 }
      );
    }

    // Shadow template reports are only visible to admins
    if (report.interview?.template?.isShadow) {
      const { profile } = await getAuthenticatedUser();
      if (profile?.role !== "admin") {
        return NextResponse.json(
          { error: "Report not found for this interview" },
          { status: 404 }
        );
      }
    }

    // Add review banner for pending reviews
    const reviewBanner = report.reviewStatus === "PENDING_REVIEW"
      ? "AI-generated assessment, pending human review"
      : null;

    return NextResponse.json({ ...report, reviewBanner });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interview report:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Generate report via Gemini (post-interview)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    // Get interview with transcript and integrity events
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            currentCompany: true,
            skills: true,
            experienceYears: true,
            industries: true,
            resumeText: true,
          },
        },
        report: true,
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    if (interview.report) {
      return NextResponse.json(
        { error: "Report already exists for this interview" },
        { status: 409 }
      );
    }

    if (!interview.transcript) {
      return NextResponse.json(
        { error: "No transcript available. Interview must be completed first." },
        { status: 400 }
      );
    }

    // Generate report via Gemini
    let reportData;
    try {
      const { generateInterviewReport } = await import("@/lib/gemini");
      reportData = await generateInterviewReport(
        interview.transcript as any[],
        {
          fullName: interview.candidate.fullName,
          currentTitle: interview.candidate.currentTitle,
          currentCompany: interview.candidate.currentCompany,
          skills: interview.candidate.skills as string[],
          experienceYears: interview.candidate.experienceYears,
          resumeText: interview.candidate.resumeText,
        },
        (interview as any).integrityEvents as any[] | null
      );
    } catch (geminiError) {
      console.error("Gemini report generation failed:", geminiError);
      return NextResponse.json(
        { error: "Failed to generate report. Check GEMINI_API_KEY configuration." },
        { status: 503 }
      );
    }

    // Save report
    const report = await prisma.interviewReport.create({
      data: {
        interviewId: id,
        technicalSkills: reportData.technicalSkills,
        softSkills: reportData.softSkills,
        domainExpertise: reportData.domainExpertise,
        clarityStructure: reportData.clarityStructure,
        problemSolving: reportData.problemSolving,
        communicationScore: reportData.communicationScore,
        measurableImpact: reportData.measurableImpact,
        summary: reportData.summary,
        strengths: reportData.strengths,
        areasToImprove: reportData.areasToImprove,
        recommendation: reportData.recommendation,
        hiringAdvice: reportData.hiringAdvice,
        overallScore: reportData.overallScore,
        integrityScore: reportData.integrityScore,
        integrityFlags: reportData.integrityFlags,
        scorerModelVersion: SCORER_MODEL_VERSION,
        scorerPromptVersion: getScorerPromptHash(),
        rubricVersion: getSkillModulesHash(),
        // Phase 1 enhanced fields
        professionalExperience: reportData.professionalExperience,
        roleFit: reportData.roleFit,
        culturalFit: reportData.culturalFit,
        thinkingJudgment: reportData.thinkingJudgment,
        confidenceLevel: reportData.confidenceLevel,
        headline: reportData.headline,
        riskSignals: reportData.riskSignals as any,
        hypothesisOutcomes: reportData.hypothesisOutcomes as any,
        evidenceHighlights: reportData.evidenceHighlights as any,
        jobMatchScore: reportData.jobMatchScore,
        requirementMatches: reportData.requirementMatches as any,
        environmentFitNotes: reportData.environmentFitNotes,
      },
    });

    // Update interview with overall score
    const overallScore = reportData.overallScore || null;
    await prisma.interview.update({
      where: { id },
      data: {
        overallScore,
        status: "COMPLETED",
        completedAt: interview.completedAt || new Date(),
      },
    });

    // Update candidate
    await prisma.candidate.update({
      where: { id: interview.candidateId },
      data: {
        ariaInterviewed: true,
        ariaOverallScore: overallScore,
      },
    });

    // Audit log: report generated
    try {
      const { user } = await getAuthenticatedUser();
      logInterviewActivity({
        interviewId: id,
        action: "report.generated",
        userId: user.id,
        userRole: "recruiter",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});
    } catch {
      // Auth may not be available for system-triggered generation
    }

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error generating interview report:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

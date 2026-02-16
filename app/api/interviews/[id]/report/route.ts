import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireInterviewAccess,
  handleAuthError,
} from "@/lib/auth";

// GET - Get the report for an interview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

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

    return NextResponse.json(report);
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

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error generating interview report:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

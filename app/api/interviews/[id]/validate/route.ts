import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

/**
 * PATCH: Persist device readiness verification result.
 * Called by InterviewPreCheck after all device checks pass.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accessToken, action } = body;

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { accessToken: true, accessTokenExpiresAt: true, isPractice: true },
    });

    if (!interview || interview.accessToken !== accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return NextResponse.json({ error: "Access token has expired" }, { status: 401 });
    }

    if (action === "readiness_verified") {
      await prisma.interview.update({
        where: { id },
        data: { readinessVerified: true },
      });

      logInterviewActivity({
        interviewId: id,
        action: "interview.readiness_verified",
        userId: id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Readiness verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accessToken, consentRecording, consentProctoring, consentPrivacy } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 }
      );
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            profileImage: true,
            onboardingStatus: true,
          },
        },
        template: {
          select: {
            aiConfig: true,
            durationMinutes: true,
            readinessCheckRequired: true,
            screenShareRequired: true,
            mode: true,
            candidateReportPolicy: true,
            retakePolicy: true,
            maxDurationMinutes: true,
          },
        },
        job: {
          select: { title: true },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    if (interview.accessToken !== accessToken) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    // Check token expiry
    if (
      interview.accessTokenExpiresAt &&
      new Date() > new Date(interview.accessTokenExpiresAt)
    ) {
      return NextResponse.json(
        { error: "Access token has expired" },
        { status: 401 }
      );
    }

    if (interview.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Interview already completed", status: interview.status },
        { status: 400 }
      );
    }

    if (interview.status === "CANCELLED" || interview.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Interview is no longer available", status: interview.status },
        { status: 400 }
      );
    }

    // Check candidate eligibility for official interviews
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: eligibility.reason },
        { status: 403 }
      );
    }

    // Persist recording consent — REQUIRED, not best-effort
    if (consentRecording !== undefined || consentProctoring !== undefined || consentPrivacy !== undefined) {
      try {
        await prisma.interview.update({
          where: { id },
          data: {
            ...(consentRecording !== undefined && { consentRecording }),
            ...(consentProctoring !== undefined && { consentProctoring }),
            ...(consentPrivacy !== undefined && { consentPrivacy }),
            consentedAt: new Date(),
          },
        });
      } catch (consentError) {
        console.error("Failed to persist consent:", consentError);
        return NextResponse.json(
          { error: "Failed to save consent. Please try again." },
          { status: 500 }
        );
      }
    }

    // Extract proctoring config from template aiConfig
    const aiConfig = (interview.template?.aiConfig as Record<string, unknown>) || {};

    // Audit log: successful validation
    logInterviewActivity({
      interviewId: id,
      action: "interview.validated",
      userId: interview.candidate.id,
      userRole: "candidate",
      metadata: { isPractice: interview.isPractice },
      ipAddress: getClientIp(request.headers),
    }).catch(() => {}); // Fire-and-forget

    return NextResponse.json({
      id: interview.id,
      type: interview.type,
      status: interview.status,
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      candidateImage: interview.candidate.profileImage,
      hasTranscript: !!interview.transcript,
      duration: interview.template?.durationMinutes || 30,
      voiceProvider: interview.voiceProvider,
      jobTitle: interview.job?.title || null,
      durationMinutes: interview.template?.durationMinutes || 30,
      isPractice: interview.isPractice,
      // Readiness and accommodations
      readinessRequired: interview.template?.readinessCheckRequired || false,
      readinessVerified: interview.readinessVerified || false,
      accommodations: interview.accommodations || null,
      // Proctoring config from template — map antiCheatLevel to proctoringLevel
      proctoringLevel: aiConfig.antiCheatLevel
        ? ({ relaxed: "light", standard: "strict", strict: "strict" } as Record<string, string>)[aiConfig.antiCheatLevel as string] || "strict"
        : (aiConfig.proctoringLevel as string) || "strict",
      pastePolicy: aiConfig.pastePolicy || "block",
      maxPasteWarnings: aiConfig.maxPasteWarnings || 3,
      // Template-level config for interview room
      screenShareRequired: interview.template?.screenShareRequired || false,
      templateMode: interview.template?.mode || null,
      candidateReportPolicy: interview.template?.candidateReportPolicy || null,
      retakePolicy: interview.template?.retakePolicy || null,
      maxDurationMinutes: interview.template?.maxDurationMinutes || interview.template?.durationMinutes || 30,
      // Include transcript for message restoration on resume
      ...(interview.status === "IN_PROGRESS" && interview.transcript
        ? { transcript: interview.transcript }
        : {}),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Interview validation error:", {
      interviewId: id,
      errorMessage,
      errorName: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Surface DB connectivity issues as 503 for better UX
    if (
      errorMessage.includes("connect") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("Connection pool")
    ) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

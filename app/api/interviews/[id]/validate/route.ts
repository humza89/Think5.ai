import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accessToken, consentRecording, consentProctoring } = body;

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
          },
        },
        template: {
          select: {
            aiConfig: true,
            durationMinutes: true,
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

    // Persist recording consent if provided
    if (consentRecording !== undefined || consentProctoring !== undefined) {
      await prisma.interview.update({
        where: { id },
        data: {
          ...(consentRecording !== undefined && { consentRecording }),
          ...(consentProctoring !== undefined && { consentProctoring }),
          consentedAt: new Date(),
        },
      });
    }

    // Extract proctoring config from template aiConfig
    const aiConfig = (interview.template?.aiConfig as Record<string, unknown>) || {};

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
      // Proctoring config from template
      proctoringLevel: aiConfig.proctoringLevel || "strict",
      pastePolicy: aiConfig.pastePolicy || "block",
      maxPasteWarnings: aiConfig.maxPasteWarnings || 3,
      // Include transcript for message restoration on resume
      ...(interview.status === "IN_PROGRESS" && interview.transcript
        ? { transcript: interview.transcript }
        : {}),
    });
  } catch (error) {
    console.error("Interview validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

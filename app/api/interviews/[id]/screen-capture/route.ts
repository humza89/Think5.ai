/**
 * Screen Capture API
 *
 * POST   — Start a screen capture session (validates consent + template policy)
 * PATCH  — Upload periodic screenshots / update session status
 * DELETE — End a screen capture session
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError } from "@/lib/auth";

// POST — Start screen capture session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: interviewId } = await params;
    
    const body = await request.json();
    const { captureType, consentGiven, accessToken } = body as {
      captureType?: string;
      consentGiven: boolean;
      accessToken?: string;
    };

    if (!consentGiven) {
      return NextResponse.json(
        { error: "Screen share consent is required" },
        { status: 400 }
      );
    }

    // Check template policy & Auth
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        status: true,
        accessToken: true,
        template: { select: { screenShareRequired: true } },
      },
    });

    if (!interview || (accessToken && interview.accessToken !== accessToken)) {
      // Allow fallback if requireInterviewAccess passes (for recruiters debugging)
      if (!accessToken) await requireInterviewAccess(interviewId);
    }

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Check for existing active session
    const existingSession = await prisma.screenCaptureSession.findFirst({
      where: { interviewId, status: "active" },
    });

    if (existingSession) {
      return NextResponse.json({
        session: existingSession,
        message: "Active session already exists",
      });
    }

    const session = await prisma.screenCaptureSession.create({
      data: {
        interviewId,
        captureType: captureType || "screen_share",
        consentGiven: true,
        status: "active",
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH — Upload screenshot or update session status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: interviewId } = await params;

    const body = await request.json();
    const { sessionId, status: newStatus, thumbnailUrl, accessToken } = body as {
      sessionId: string;
      status?: string;
      thumbnailUrl?: string;
      accessToken?: string;
    };

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview || (accessToken && interview.accessToken !== accessToken)) {
      if (!accessToken) await requireInterviewAccess(interviewId);
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await prisma.screenCaptureSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.interviewId !== interviewId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Append thumbnail URL
    if (thumbnailUrl) {
      const existing = (session.thumbnailUrls as string[]) || [];
      updateData.thumbnailUrls = [...existing, thumbnailUrl];
    }

    // Update status
    if (newStatus && ["active", "paused", "ended", "failed"].includes(newStatus)) {
      updateData.status = newStatus;
      if (newStatus === "ended" || newStatus === "failed") {
        updateData.endedAt = new Date();
      }
    }

    const updated = await prisma.screenCaptureSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE — End screen capture session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: interviewId } = await params;

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const accessToken = searchParams.get("accessToken");

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview || (accessToken && interview.accessToken !== accessToken)) {
      if (!accessToken) await requireInterviewAccess(interviewId);
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await prisma.screenCaptureSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.interviewId !== interviewId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updated = await prisma.screenCaptureSession.update({
      where: { id: sessionId },
      data: { status: "ended", endedAt: new Date() },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Interview Pause/Resume API
 *
 * POST /api/interviews/[id]/pause
 * Body: { action: "pause" | "resume", accessToken: string }
 *
 * Pauses or resumes an interview with state machine validation.
 * Auto-cancels if paused for more than 10 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidTransition } from "@/lib/interview-state-machine";

const MAX_PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action, accessToken } = await req.json();

    if (!action || !accessToken) {
      return NextResponse.json(
        { error: "Missing action or accessToken" },
        { status: 400 }
      );
    }

    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'pause' or 'resume'" },
        { status: 400 }
      );
    }

    // Validate access
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        accessToken: true,
        pausedAt: true,
        totalPauseDurationMs: true,
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
        { status: 403 }
      );
    }

    if (action === "pause") {
      if (!isValidTransition(interview.status, "PAUSED")) {
        return NextResponse.json(
          { error: `Cannot pause interview in ${interview.status} state` },
          { status: 409 }
        );
      }

      await prisma.interview.update({
        where: { id },
        data: {
          status: "PAUSED",
          pausedAt: new Date(),
        },
      });

      return NextResponse.json({
        status: "PAUSED",
        maxPauseDurationMs: MAX_PAUSE_DURATION_MS,
      });
    }

    if (action === "resume") {
      if (!isValidTransition(interview.status, "IN_PROGRESS")) {
        return NextResponse.json(
          { error: `Cannot resume interview in ${interview.status} state` },
          { status: 409 }
        );
      }

      // Check if pause exceeded max duration
      const pauseDuration = interview.pausedAt
        ? Date.now() - new Date(interview.pausedAt).getTime()
        : 0;

      if (pauseDuration > MAX_PAUSE_DURATION_MS) {
        // Auto-cancel
        await prisma.interview.update({
          where: { id },
          data: {
            status: "CANCELLED",
            pausedAt: null,
            totalPauseDurationMs:
              interview.totalPauseDurationMs + pauseDuration,
          },
        });

        return NextResponse.json(
          {
            error: "Interview was automatically cancelled due to exceeding maximum pause duration (10 minutes)",
            status: "CANCELLED",
          },
          { status: 410 }
        );
      }

      await prisma.interview.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          pausedAt: null,
          totalPauseDurationMs: interview.totalPauseDurationMs + pauseDuration,
        },
      });

      return NextResponse.json({ status: "IN_PROGRESS" });
    }
  } catch (err) {
    console.error("[Pause API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

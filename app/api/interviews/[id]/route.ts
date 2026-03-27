import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireInterviewAccess,
  handleAuthError,
  getAuthenticatedUser,
} from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { isValidTransition, getAllowedTransitions } from "@/lib/interview-state-machine";
import { inngest } from "@/inngest/client";
import { cascadeInterviewStatus } from "@/lib/invitation-lifecycle";

// GET - Get interview details with report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    // Audit trail: log interview detail access
    const { user, profile } = await getAuthenticatedUser();
    logInterviewActivity({
      interviewId: id,
      action: "interview.detail_viewed",
      userId: user.id,
      userRole: profile.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            currentTitle: true,
            currentCompany: true,
            profileImage: true,
            skills: true,
            experienceYears: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
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

    return NextResponse.json(interview);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH - Update interview status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    const body = await request.json();
    const { status: newStatus, transcript, duration, overallScore } = body;

    const updateData: any = {};

    if (newStatus) {
      // Validate status transition using state machine
      const currentInterview = await prisma.interview.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!currentInterview) {
        return NextResponse.json({ error: "Interview not found" }, { status: 404 });
      }
      if (!isValidTransition(currentInterview.status, newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${currentInterview.status} to ${newStatus}. Allowed transitions: ${getAllowedTransitions(currentInterview.status).join(", ") || "none (terminal state)"}`,
          },
          { status: 400 }
        );
      }

      updateData.status = newStatus;

      if (newStatus === "IN_PROGRESS") {
        updateData.startedAt = new Date();
      }

      if (newStatus === "COMPLETED") {
        updateData.completedAt = new Date();

        // Update candidate's ariaInterviewed flag
        const interview = await prisma.interview.findUnique({
          where: { id },
          select: { candidateId: true },
        });

        if (interview) {
          await prisma.candidate.update({
            where: { id: interview.candidateId },
            data: {
              ariaInterviewed: true,
              ...(overallScore !== undefined ? { ariaOverallScore: overallScore } : {}),
            },
          });
        }
      }
    }

    if (transcript !== undefined) updateData.transcript = transcript;
    if (duration !== undefined) updateData.duration = duration;
    if (overallScore !== undefined) updateData.overallScore = overallScore;

    const updated = await prisma.interview.update({
      where: { id },
      data: updateData,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
          },
        },
        report: {
          select: {
            id: true,
            recommendation: true,
          },
        },
      },
    });

    // Cascade interview status to invitation lifecycle
    if (newStatus) {
      cascadeInterviewStatus(id, newStatus).catch(console.error);
    }

    // Dispatch Inngest job when interview completes
    if (newStatus === "COMPLETED") {
      inngest
        .send({ name: "interview/completed", data: { interviewId: id } })
        .catch((err: unknown) => {
          // Fall back to in-process if Inngest unavailable
          console.error("Inngest dispatch failed, falling back:", err);
          import("@/lib/report-generator").then(({ generateReportInBackground }) =>
            generateReportInBackground(id).catch(console.error)
          );
        });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

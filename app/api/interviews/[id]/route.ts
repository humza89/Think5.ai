import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireInterviewAccess,
  handleAuthError,
} from "@/lib/auth";

// GET - Get interview details with report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

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

    return NextResponse.json(updated);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

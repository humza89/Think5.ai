import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  getRecruiterForUser,
  handleAuthError,
  AuthError,
} from "@/lib/auth";

async function requireInterviewAccess(interviewId: string) {
  const { user, profile } = await getAuthenticatedUser();

  if (!profile || !["recruiter", "admin"].includes(profile.role)) {
    throw new AuthError("Forbidden: insufficient permissions", 403);
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { scheduledBy: true, candidateId: true },
  });

  if (!interview) {
    throw new AuthError("Interview not found", 404);
  }

  // Admins can access any interview
  if (profile.role === "admin") {
    return { user, profile, interview };
  }

  // Recruiters: must have scheduled the interview OR own the candidate
  const recruiter = await getRecruiterForUser(
    user.id,
    profile.email,
    `${profile.first_name} ${profile.last_name}`
  );

  if (interview.scheduledBy !== recruiter.id) {
    // Also check if recruiter owns the candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id: interview.candidateId },
      select: { recruiterId: true },
    });

    if (!candidate || candidate.recruiterId !== recruiter.id) {
      throw new AuthError("Forbidden: you do not have access to this interview", 403);
    }
  }

  return { user, profile, interview };
}

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
    const { status: newStatus, transcript, geminiSessionId, duration, overallScore } = body;

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
    if (geminiSessionId !== undefined) updateData.geminiSessionId = geminiSessionId;
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRecruiterForUser, handleAuthError, AuthError } from "@/lib/auth";
import { sendInterviewInvitation } from "@/lib/email/interview-invite";
import { randomUUID } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { user, profile } = await getAuthenticatedUser();
    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      throw new AuthError("Forbidden: insufficient permissions", 403);
    }

    const body = await request.json();
    const { email } = body;

    // Get interview with candidate info
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            recruiterId: true,
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    // Verify recruiter owns the candidate (unless admin)
    if (profile.role === "recruiter") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
      if (interview.candidate.recruiterId !== recruiter.id) {
        throw new AuthError("Forbidden: you do not own this candidate", 403);
      }
    }

    const candidateEmail = email || interview.candidate.email;
    if (!candidateEmail) {
      return NextResponse.json(
        { error: "No email address available for this candidate" },
        { status: 400 }
      );
    }

    // Generate access token
    const accessToken = randomUUID();

    // Update interview with token, email, and 7-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.interview.update({
      where: { id },
      data: {
        accessToken,
        accessTokenExpiresAt: expiresAt,
        invitedEmail: candidateEmail,
      },
    });

    // Build interview URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const interviewUrl = `${baseUrl}/interview/${id}?token=${accessToken}`;

    // Send email
    await sendInterviewInvitation({
      candidateEmail,
      candidateName: interview.candidate.fullName,
      interviewType: interview.type,
      interviewUrl,
      recruiterName: `${profile.first_name} ${profile.last_name}`,
    });

    return NextResponse.json({
      success: true,
      interviewUrl,
      sentTo: candidateEmail,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Interview invite error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

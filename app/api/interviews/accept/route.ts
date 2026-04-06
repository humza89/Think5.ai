import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const SESSION_COOKIE_NAME = "interview-session";
const SESSION_MAX_AGE = 7200; // 2 hours

/**
 * POST /api/interviews/accept
 *
 * Accepts an invitation token, creates an Interview if needed,
 * updates the invitation status to ACCEPTED, and returns the
 * interview ID. Sets an HttpOnly session cookie for secure access
 * so the access token never appears in the URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
    }

    // Look up invitation
    const invitation = await prisma.interviewInvitation.findUnique({
      where: { token },
      include: {
        interview: { select: { id: true, accessToken: true } },
        candidate: { select: { id: true } },
        job: { select: { id: true, title: true, description: true } },
        template: { select: { id: true } },
        recruiter: { select: { id: true, companyId: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
    }

    // Check expiry
    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }

    // Check if already completed or declined
    if (["COMPLETED", "DECLINED"].includes(invitation.status)) {
      return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
    }

    // If interview already exists (from a previous acceptance), return it
    if (invitation.interview) {
      let { accessToken: existingToken } = invitation.interview;

      // If the interview was created without an accessToken (scheduled by recruiter),
      // generate one now so the candidate can access the interview room
      if (!existingToken) {
        const newToken = randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma.interview.update({
          where: { id: invitation.interview.id },
          data: { accessToken: newToken, accessTokenExpiresAt: expiresAt },
        });
        existingToken = newToken;
      }

      // Update invitation status
      if (invitation.status !== "ACCEPTED") {
        await prisma.interviewInvitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", acceptedAt: new Date(), openedAt: invitation.openedAt || new Date() },
        });
      }

      const res = NextResponse.json({
        interviewId: invitation.interview.id,
        accessToken: existingToken,
      });
      // Set HttpOnly session cookie so token doesn't need to be in the URL
      res.cookies.set(SESSION_COOKIE_NAME, `${invitation.interview.id}:${existingToken}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return res;
    }

    // Create the interview from the invitation
    const accessToken = randomUUID();
    const accessTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const interview = await prisma.interview.create({
      data: {
        candidateId: invitation.candidateId!,
        scheduledBy: invitation.recruiterId,
        jobId: invitation.jobId || undefined,
        templateId: invitation.templateId || undefined,
        type: "TECHNICAL",
        mode: "GENERAL_PROFILE",
        status: "PENDING",
        voiceProvider: "gemini-live",
        accessToken,
        accessTokenExpiresAt,
        companyId: invitation.recruiter?.companyId || undefined,
        invitationId: invitation.id,
      },
    });

    // Update invitation status
    await prisma.interviewInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        openedAt: invitation.openedAt || new Date(),
      },
    });

    const res = NextResponse.json({
      interviewId: interview.id,
      accessToken: interview.accessToken,
    });
    // Set HttpOnly session cookie so token doesn't need to be in the URL
    res.cookies.set(SESSION_COOKIE_NAME, `${interview.id}:${interview.accessToken}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    console.error("Invitation acceptance error:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}

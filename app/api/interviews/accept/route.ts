import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

/**
 * POST /api/interviews/accept
 *
 * Accepts an invitation token, creates an Interview if needed,
 * updates the invitation status to ACCEPTED, and returns the
 * interview ID + access token for redirect.
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
      // Update invitation status
      if (invitation.status !== "ACCEPTED") {
        await prisma.interviewInvitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", acceptedAt: new Date(), openedAt: invitation.openedAt || new Date() },
        });
      }

      return NextResponse.json({
        interviewId: invitation.interview.id,
        accessToken: invitation.interview.accessToken,
      });
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
        voiceProvider: "text-sse",
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

    return NextResponse.json({
      interviewId: interview.id,
      accessToken: interview.accessToken,
    });
  } catch (error) {
    console.error("Invitation acceptance error:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}

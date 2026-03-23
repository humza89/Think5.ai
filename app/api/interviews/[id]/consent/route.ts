import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

/**
 * DELETE /api/interviews/[id]/consent — Revoke interview consent
 *
 * Allows a candidate to withdraw recording/proctoring/privacy consent.
 * This sets all consent flags to false and logs the revocation.
 * The interview can no longer collect proctoring data after revocation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { accessToken } = body as { accessToken?: string };

    if (!accessToken) {
      return NextResponse.json({ error: "Access token required" }, { status: 401 });
    }

    // Validate access
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        accessToken: true,
        accessTokenExpiresAt: true,
        status: true,
        candidateId: true,
        consentRecording: true,
        consentProctoring: true,
        consentPrivacy: true,
      },
    });

    if (!interview || interview.accessToken !== accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return NextResponse.json({ error: "Access token expired" }, { status: 401 });
    }

    // Revoke all consent flags
    await prisma.interview.update({
      where: { id },
      data: {
        consentRecording: false,
        consentProctoring: false,
        consentPrivacy: false,
      },
    });

    // Audit log
    logInterviewActivity({
      interviewId: id,
      action: "interview.consent_revoked",
      userId: interview.candidateId,
      userRole: "candidate",
      ipAddress: getClientIp(request.headers),
      metadata: {
        previousConsent: {
          recording: interview.consentRecording,
          proctoring: interview.consentProctoring,
          privacy: interview.consentPrivacy,
        },
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Consent has been revoked. Proctoring data will no longer be collected.",
    });
  } catch (error) {
    console.error("Consent revocation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

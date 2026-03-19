import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// POST - Generate a shareable report link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    const body = await request.json().catch(() => ({}));
    const { recipientEmail, purpose } = body as { recipientEmail?: string; purpose?: string };

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { report: { select: { id: true, shareToken: true, shareRevoked: true } } },
    });

    if (!interview?.report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Reuse existing token if present and not revoked, otherwise generate new
    let shareToken = interview.report.shareRevoked ? null : interview.report.shareToken;
    if (!shareToken) {
      shareToken = randomUUID();
      const shareExpiresAt = new Date();
      shareExpiresAt.setDate(shareExpiresAt.getDate() + 30); // 30-day expiry

      await prisma.interviewReport.update({
        where: { id: interview.report.id },
        data: {
          shareToken,
          shareExpiresAt,
          shareRevoked: false,
          ...(recipientEmail && { recipientEmail }),
          ...(purpose && { sharePurpose: purpose }),
        },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${baseUrl}/reports/shared/${shareToken}`;

    // Audit log: report shared
    try {
      const { user } = await getAuthenticatedUser();
      logInterviewActivity({
        interviewId: id,
        action: "report.shared",
        userId: user.id,
        userRole: "recruiter",
        metadata: { recipientEmail, purpose },
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});
    } catch {
      // Non-critical
    }

    return NextResponse.json({ shareUrl, shareToken });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error generating share link:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

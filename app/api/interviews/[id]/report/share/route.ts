import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInterviewAccessScope, handleAuthError } from "@/lib/auth";
import { randomUUID } from "crypto";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// POST - Generate a shareable report link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 sweep: single tenant-scoped query for both the access check
    // and the data we need. A cross-tenant id will match no row and fall
    // out at the 404 below — no timing side-channel.
    const scope = await buildInterviewAccessScope(id);

    const body = await request.json().catch(() => ({}));
    const { recipientEmail, purpose, expiryDays, allowedScopes } = body as {
      recipientEmail?: string;
      purpose?: string;
      expiryDays?: number;
      allowedScopes?: string[];
    };

    // Fetch interview + report in ONE tenant-scoped query. Previously
    // this was a two-query dance (one for companyId, one for report)
    // with no tenant filter on either. If the caller can't see the
    // interview at all, we return 404 with the same shape as any other
    // miss.
    const interviewData = await prisma.interview.findFirst({
      where: scope.whereFragment,
      select: {
        companyId: true,
        report: { select: { id: true, shareToken: true, shareRevoked: true } },
      },
    });

    if (!interviewData) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Validate email domain against tenant sharing policy if configured
    if (recipientEmail && interviewData.companyId) {
      const policy = await prisma.retentionPolicy.findUnique({
        where: { companyId: interviewData.companyId },
      });
      const sharingPolicy = policy?.metadata as { allowedDomains?: string[] } | null;
      if (sharingPolicy?.allowedDomains?.length) {
        const emailDomain = recipientEmail.split("@")[1]?.toLowerCase();
        if (!sharingPolicy.allowedDomains.includes(emailDomain)) {
          return NextResponse.json(
            { error: `Sharing restricted to these domains: ${sharingPolicy.allowedDomains.join(", ")}` },
            { status: 403 }
          );
        }
      }
    }

    if (!interviewData.report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Reuse existing token if present and not revoked, otherwise generate new
    let shareToken = interviewData.report.shareRevoked ? null : interviewData.report.shareToken;
    if (!shareToken) {
      shareToken = randomUUID();
      const shareExpiresAt = new Date();
      const days = Math.min(expiryDays || 30, 90); // Max 90 days
      shareExpiresAt.setDate(shareExpiresAt.getDate() + days);

      await prisma.interviewReport.update({
        where: { id: interviewData.report.id },
        data: {
          shareToken,
          shareExpiresAt,
          shareRevoked: false,
          ...(recipientEmail && { recipientEmail }),
          ...(purpose && { sharePurpose: purpose }),
          ...(allowedScopes && { shareScopes: allowedScopes }),
        },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${baseUrl}/reports/shared/${shareToken}`;

    // Audit log: report shared. User info comes from the scope we
    // already resolved — no extra auth round-trip.
    logInterviewActivity({
      interviewId: id,
      action: "report.shared",
      userId: scope.userId,
      userRole: scope.role,
      metadata: { recipientEmail, purpose, expiryDays, allowedScopes },
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    return NextResponse.json({ shareUrl, shareToken });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error generating share link:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

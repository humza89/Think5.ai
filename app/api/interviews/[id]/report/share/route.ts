import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError } from "@/lib/auth";
import { randomUUID } from "crypto";

// POST - Generate a shareable report link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await requireInterviewAccess(id);

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { report: { select: { id: true, shareToken: true } } },
    });

    if (!interview?.report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Reuse existing token if present, otherwise generate new
    let shareToken = interview.report.shareToken;
    if (!shareToken) {
      shareToken = randomUUID();
      const shareExpiresAt = new Date();
      shareExpiresAt.setDate(shareExpiresAt.getDate() + 30); // 30-day expiry

      await prisma.interviewReport.update({
        where: { id: interview.report.id },
        data: { shareToken, shareExpiresAt },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${baseUrl}/reports/shared/${shareToken}`;

    return NextResponse.json({ shareUrl, shareToken });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error generating share link:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

// GET — List all actively shared reports for admin visibility
export async function GET() {
  try {
    await requireRole(["admin"]);

    const sharedReports = await prisma.interviewReport.findMany({
      where: {
        shareToken: { not: null },
        shareRevoked: false,
        OR: [
          { shareExpiresAt: null },
          { shareExpiresAt: { gt: new Date() } },
        ],
      },
      select: {
        id: true,
        shareToken: true,
        shareExpiresAt: true,
        recipientEmail: true,
        sharePurpose: true,
        overallScore: true,
        recommendation: true,
        createdAt: true,
        interview: {
          select: {
            id: true,
            type: true,
            candidate: {
              select: { fullName: true, email: true },
            },
          },
        },
        views: {
          select: { viewedAt: true, viewerIp: true },
          orderBy: { viewedAt: "desc" },
          take: 5,
        },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      sharedReports,
      total: sharedReports.length,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

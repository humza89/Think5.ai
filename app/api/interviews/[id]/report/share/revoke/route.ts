import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// DELETE - Revoke a shared report link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await requireInterviewAccess(id);

    const report = await prisma.interviewReport.findUnique({
      where: { interviewId: id },
      select: { id: true, shareToken: true },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (!report.shareToken) {
      return NextResponse.json({ error: "No share link to revoke" }, { status: 400 });
    }

    await prisma.interviewReport.update({
      where: { id: report.id },
      data: {
        shareRevoked: true,
        shareToken: null,
      },
    });

    // Audit log
    logInterviewActivity({
      interviewId: id,
      action: "report.share_revoked",
      userId: user.id,
      userRole: profile.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Share link revoked" });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error revoking share link:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInterviewAccessScope, handleAuthError } from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// DELETE - Revoke a shared report link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Tenant-scoped access + data in one query (see buildInterviewAccessScope).
    const scope = await buildInterviewAccessScope(id);

    // Only recruiters and admins may revoke share links (unchanged policy).
    if (!["recruiter", "admin"].includes(scope.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const interviewWithReport = await prisma.interview.findFirst({
      where: scope.whereFragment,
      select: { report: { select: { id: true, shareToken: true } } },
    });

    if (!interviewWithReport) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const report = interviewWithReport.report;
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
      userId: scope.userId,
      userRole: scope.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Share link revoked" });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error revoking share link:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

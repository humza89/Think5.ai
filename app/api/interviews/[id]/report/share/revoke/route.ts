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

    // Track-1 sweep: tenant-scoped access + data fetch in one query.
    // The old code used a two-query dance (auth check, then unscoped
    // findUnique on interviewReport by interviewId) which meant a
    // cross-tenant id could reach the DB. Now we resolve the interview
    // row via the scoped fragment first, which refuses cross-tenant
    // access at the database layer.
    const scope = await buildInterviewAccessScope(id);

    const interviewWithReport = await prisma.interview.findFirst({
      where: scope.whereFragment,
      select: {
        report: { select: { id: true, shareToken: true } },
      },
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

    // Audit log — reuses the scope we already resolved.
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

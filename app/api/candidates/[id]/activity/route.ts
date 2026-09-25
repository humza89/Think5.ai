import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requireRecruiterRole } from "@/lib/auth";

/**
 * GET /api/candidates/[id]/activity — ActivityLog entries about a candidate
 * the recruiter owns (Phase 0 T10): rows whose entity is the candidate plus
 * rows about their applications and interviews.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { recruiter } = await requireRecruiterRole();
    const { id } = await params;
    const candidate = await prisma.candidate.findFirst({ where: { id, recruiterId: recruiter.id }, select: { id: true } });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    const [applications, interviews] = await Promise.all([
      prisma.application.findMany({ where: { candidateId: id }, select: { id: true } }),
      prisma.interview.findMany({ where: { candidateId: id }, select: { id: true } }),
    ]);
    const entityIds = [id, ...applications.map((a: { id: string }) => a.id), ...interviews.map((i: { id: string }) => i.id)];
    const events = await prisma.activityLog.findMany({
      where: { OR: [{ entityType: "Candidate", entityId: id }, { entityType: "Application", entityId: { in: entityIds } }, { entityType: "Interview", entityId: { in: entityIds } }] },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, entityType: true, entityId: true, userRole: true, metadata: true, createdAt: true },
    });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

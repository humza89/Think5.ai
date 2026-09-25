import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";
import { cancelAccountDeletion, pendingAccountDeletion, requestAccountDeletion, requestCandidateDeletion } from "@/lib/account-deletion";

/**
 * Account deletion for the signed-in user (Phase 0 T9).
 * POST { confirm: "DELETE", reason? } → creates the role-appropriate deletion request (30-day grace).
 * GET → pending request, if any. DELETE → cancel a pending request.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "DELETE") return NextResponse.json({ error: 'Type "DELETE" to confirm' }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
    const p = profile as { role: string; email: string };
    if (p.role === "candidate") {
      const candidate = await prisma.candidate.findFirst({ where: { email: p.email }, select: { id: true, legalHold: true } });
      if (!candidate) return NextResponse.json({ error: "Candidate record not found" }, { status: 404 });
      const result = await requestCandidateDeletion(candidate, reason);
      return NextResponse.json(result.body, { status: result.status });
    }
    const result = await requestAccountDeletion({ id: user.id, email: p.email, role: p.role }, reason);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const p = profile as { role: string; email: string };
    if (p.role === "candidate") {
      const candidate = await prisma.candidate.findFirst({ where: { email: p.email }, select: { id: true } });
      const pending = candidate
        ? await prisma.dataDeletionRequest.findFirst({ where: { candidateId: candidate.id, status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true, status: true, gracePeriodEndsAt: true, requestedAt: true } })
        : null;
      return NextResponse.json({ pending });
    }
    return NextResponse.json({ pending: await pendingAccountDeletion(user.id) });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const p = profile as { role: string; email: string };
    if (p.role === "candidate") {
      return NextResponse.json({ error: "Cancel through /api/candidate/data-deletion-request" }, { status: 400 });
    }
    const result = await cancelAccountDeletion({ id: user.id, role: p.role });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

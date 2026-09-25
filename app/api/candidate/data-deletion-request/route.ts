/**
 * DSAR (Data Subject Access Request) — Candidate Data Deletion
 *
 * POST:   Request data deletion (30-day grace period)
 * GET:    Check status of pending deletion request
 * DELETE: Cancel a pending deletion request (within grace period)
 *
 * GDPR Article 17 — Right to Erasure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateRole, handleAuthError } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { logInterviewActivity } from "@/lib/interview-audit";
import { requestCandidateDeletion } from "@/lib/account-deletion";

const GRACE_PERIOD_DAYS = 30;

// POST — Request data deletion (T9: shared with /api/account/delete and DELETE /api/candidate/settings)
export async function POST(request: NextRequest) {
  try {
    const { candidate } = await requireCandidateRole();
    const body = await request.json().catch(() => ({}));
    const reason = (body as { reason?: string }).reason || null;
    const result = await requestCandidateDeletion(candidate, reason);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// GET — Check deletion request status
export async function GET() {
  try {
    const { candidate } = await requireCandidateRole();

    const request = await prisma.dataDeletionRequest.findFirst({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: "desc" },
    });

    if (!request) {
      return NextResponse.json({ hasPendingRequest: false });
    }

    return NextResponse.json({
      hasPendingRequest: request.status === "PENDING",
      request: {
        id: request.id,
        status: request.status,
        requestedAt: request.requestedAt,
        gracePeriodEndsAt: request.gracePeriodEndsAt,
        processedAt: request.processedAt,
        cancelledAt: request.cancelledAt,
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE — Cancel a pending deletion request
export async function DELETE() {
  try {
    const { candidate } = await requireCandidateRole();

    const pending = await prisma.dataDeletionRequest.findFirst({
      where: {
        candidateId: candidate.id,
        status: "PENDING",
      },
    });

    if (!pending) {
      return NextResponse.json(
        { error: "No pending deletion request found" },
        { status: 404 }
      );
    }

    if (new Date() > pending.gracePeriodEndsAt) {
      return NextResponse.json(
        { error: "Grace period has expired. Deletion is being processed." },
        { status: 410 }
      );
    }

    await prisma.dataDeletionRequest.update({
      where: { id: pending.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // Audit log
    logInterviewActivity({
      interviewId: candidate.id,
      action: "dsar.deletion_cancelled",
      userId: candidate.id,
      userRole: "candidate",
    }).catch(() => {});

    return NextResponse.json({
      message: "Deletion request cancelled successfully.",
      requestId: pending.id,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

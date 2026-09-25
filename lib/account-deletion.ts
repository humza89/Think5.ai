/**
 * Account deletion requests (Phase 0 T9). Candidates keep the GDPR flow on
 * DataDeletionRequest (30-day grace, executed by the data-deletion Inngest
 * function). Recruiters, hiring managers and admins get an
 * AccountDeletionRequest with the same grace period; execution for those
 * roles is an admin runbook step until Phase 1 adds the job.
 */
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { logActivity } from "@/lib/activity-log";
import { logInterviewActivity } from "@/lib/interview-audit";

export const GRACE_PERIOD_DAYS = 30;

export interface DeletionRequestResult {
  status: number;
  body: Record<string, unknown>;
}

function gracePeriodEnd(): Date {
  return new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/** Candidate flow (unchanged behaviour, now shared by two routes). */
export async function requestCandidateDeletion(candidate: { id: string; legalHold?: boolean | null }, reason: string | null): Promise<DeletionRequestResult> {
  const existing = await prisma.dataDeletionRequest.findFirst({ where: { candidateId: candidate.id, status: { in: ["PENDING", "PROCESSING"] } } });
  if (existing) {
    return { status: 409, body: { error: "A deletion request is already pending", requestId: existing.id, status: existing.status, gracePeriodEndsAt: existing.gracePeriodEndsAt } };
  }
  if (candidate.legalHold) {
    return { status: 403, body: { error: "Your data is subject to a legal hold and cannot be deleted at this time. Please contact support." } };
  }
  const gracePeriodEndsAt = gracePeriodEnd();
  const deletionRequest = await prisma.dataDeletionRequest.create({ data: { candidateId: candidate.id, reason, gracePeriodEndsAt } });
  await inngest
    .send({ name: "candidate/deletion.requested", data: { requestId: deletionRequest.id, candidateId: candidate.id, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() } })
    .catch((err) => console.error("Failed to dispatch deletion job:", err));
  logInterviewActivity({ interviewId: candidate.id, action: "dsar.deletion_requested", userId: candidate.id, userRole: "candidate" }).catch(() => {});
  return {
    status: 201,
    body: {
      requestId: deletionRequest.id,
      status: "PENDING",
      gracePeriodEndsAt,
      message: `Your data deletion request has been received. You have ${GRACE_PERIOD_DAYS} days to cancel before deletion is permanent.`,
    },
  };
}

/** Non-candidate flow. */
export async function requestAccountDeletion(user: { id: string; email: string; role: string }, reason: string | null): Promise<DeletionRequestResult> {
  const existing = await prisma.accountDeletionRequest.findFirst({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } } });
  if (existing) {
    return { status: 409, body: { error: "A deletion request is already pending", requestId: existing.id, status: existing.status, gracePeriodEndsAt: existing.gracePeriodEndsAt } };
  }
  const gracePeriodEndsAt = gracePeriodEnd();
  const request = await prisma.accountDeletionRequest.create({ data: { userId: user.id, email: user.email, role: user.role, reason, gracePeriodEndsAt } });
  await logActivity({ userId: user.id, userRole: user.role, action: "account.deletion_requested", entityType: "User", entityId: user.id, metadata: { requestId: request.id, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() } }).catch(() => {});
  return {
    status: 201,
    body: {
      requestId: request.id,
      status: "PENDING",
      gracePeriodEndsAt,
      message: `Your account deletion request has been received. You have ${GRACE_PERIOD_DAYS} days to cancel before it is processed.`,
    },
  };
}

export async function cancelAccountDeletion(user: { id: string; role: string }): Promise<DeletionRequestResult> {
  const existing = await prisma.accountDeletionRequest.findFirst({ where: { userId: user.id, status: "PENDING" } });
  if (!existing) return { status: 404, body: { error: "No pending deletion request" } };
  await prisma.accountDeletionRequest.update({ where: { id: existing.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await logActivity({ userId: user.id, userRole: user.role, action: "account.deletion_cancelled", entityType: "User", entityId: user.id, metadata: { requestId: existing.id } }).catch(() => {});
  return { status: 200, body: { cancelled: true, requestId: existing.id } };
}

export async function pendingAccountDeletion(userId: string) {
  return prisma.accountDeletionRequest.findFirst({ where: { userId, status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true, status: true, gracePeriodEndsAt: true, requestedAt: true } });
}

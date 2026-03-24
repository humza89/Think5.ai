/**
 * Invitation Lifecycle State Machine
 *
 * Manages canonical invitation states and transitions.
 * Provides transition validation and cascading updates
 * when interview status changes.
 */

import { prisma } from "@/lib/prisma";

type InvitationStatus =
  | "CREATED"
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED"
  | "DECLINED"
  | "INTERVIEW_STARTED"
  | "INTERVIEW_COMPLETED"
  | "ABANDONED";

const VALID_TRANSITIONS: Record<InvitationStatus, InvitationStatus[]> = {
  CREATED: ["SENT", "REVOKED"],
  PENDING: ["SENT", "REVOKED"],
  SENT: ["DELIVERED", "OPENED", "ACCEPTED", "EXPIRED", "REVOKED"],
  DELIVERED: ["OPENED", "ACCEPTED", "EXPIRED", "REVOKED"],
  OPENED: ["ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"],
  ACCEPTED: ["INTERVIEW_STARTED", "EXPIRED", "REVOKED", "ABANDONED"],
  EXPIRED: [],
  REVOKED: [],
  DECLINED: [],
  INTERVIEW_STARTED: ["INTERVIEW_COMPLETED", "ABANDONED"],
  INTERVIEW_COMPLETED: [],
  ABANDONED: [],
};

const TERMINAL_STATES: InvitationStatus[] = [
  "EXPIRED",
  "REVOKED",
  "DECLINED",
  "INTERVIEW_COMPLETED",
  "ABANDONED",
];

export function isValidInvitationTransition(
  from: string,
  to: string
): boolean {
  const allowed = VALID_TRANSITIONS[from as InvitationStatus];
  if (!allowed) return false;
  return allowed.includes(to as InvitationStatus);
}

export function isTerminalInvitationState(status: string): boolean {
  return TERMINAL_STATES.includes(status as InvitationStatus);
}

/**
 * Transition an invitation to a new status with validation.
 * Returns the updated invitation or null if transition is invalid.
 */
export async function transitionInvitation(
  invitationId: string,
  newStatus: InvitationStatus,
  metadata?: { revokedBy?: string }
): Promise<{ success: boolean; error?: string }> {
  const invitation = await prisma.interviewInvitation.findUnique({
    where: { id: invitationId },
    select: { status: true },
  });

  if (!invitation) {
    return { success: false, error: "Invitation not found" };
  }

  if (!isValidInvitationTransition(invitation.status, newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${invitation.status} to ${newStatus}`,
    };
  }

  const updateData: Record<string, unknown> = { status: newStatus };

  // Set lifecycle timestamps
  switch (newStatus) {
    case "SENT":
      updateData.sentAt = new Date();
      break;
    case "DELIVERED":
      updateData.deliveredAt = new Date();
      break;
    case "OPENED":
      updateData.openedAt = new Date();
      break;
    case "ACCEPTED":
      updateData.acceptedAt = new Date();
      break;
    case "INTERVIEW_COMPLETED":
      updateData.completedAt = new Date();
      break;
    case "REVOKED":
      updateData.revokedAt = new Date();
      if (metadata?.revokedBy) updateData.revokedBy = metadata.revokedBy;
      break;
  }

  await prisma.interviewInvitation.update({
    where: { id: invitationId },
    data: updateData,
  });

  return { success: true };
}

/**
 * Cascade interview status changes to the associated invitation.
 * Called from interview state transition handlers.
 */
export async function cascadeInterviewStatus(
  interviewId: string,
  interviewStatus: string
): Promise<void> {
  // Find the invitation linked to this interview
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { invitationId: true },
  });

  if (!interview?.invitationId) return;

  const statusMap: Record<string, InvitationStatus> = {
    IN_PROGRESS: "INTERVIEW_STARTED",
    COMPLETED: "INTERVIEW_COMPLETED",
    CANCELLED: "ABANDONED",
    EXPIRED: "EXPIRED",
  };

  const newInvitationStatus = statusMap[interviewStatus];
  if (!newInvitationStatus) return;

  // Best-effort cascade — don't fail the interview transition
  try {
    await transitionInvitation(interview.invitationId, newInvitationStatus);
  } catch (err) {
    console.error("Invitation cascade failed:", err);
  }
}

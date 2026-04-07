/**
 * Real-time Notification Helper
 *
 * Creates in-app notifications stored in the Notification model.
 * Used by Inngest pipeline and other server-side processes.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type NotificationType =
  | "INTERVIEW_INVITE"
  | "APPLICATION_UPDATE"
  | "MATCH_ALERT"
  | "SYSTEM"
  | "REPORT_READY"
  | "INTERVIEW_COMPLETED";

interface CreateNotificationParams {
  userId: string;
  candidateId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export async function createNotification(
  params: CreateNotificationParams
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        candidateId: params.candidateId,
        type: params.type as any,
        title: params.title,
        message: params.message,
        data: params.data ?? undefined,
      },
    });
  } catch (err) {
    logger.error("[Notification] Failed to create notification", { error: err });
  }
}

/**
 * Notify recruiter and candidate that a report is ready.
 */
export async function notifyReportReady(interviewId: string): Promise<void> {
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        candidate: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { supabaseUserId: true, name: true } },
      },
    });

    if (!interview) return;

    // Notify recruiter
    if (interview.recruiter.supabaseUserId) {
      await createNotification({
        userId: interview.recruiter.supabaseUserId,
        type: "REPORT_READY" as any,
        title: "Interview Report Ready",
        message: `The interview report for ${interview.candidate.fullName} is now available.`,
        data: { interviewId: interview.id },
      });
    }

    // Notify candidate (find their supabase user by email)
    const candidateProfile = (await (prisma.$queryRawUnsafe as any)(
      `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
      interview.candidate.email
    ).catch(() => [])) as { id: string }[];

    if (candidateProfile.length > 0) {
      await createNotification({
        userId: candidateProfile[0].id,
        candidateId: interview.candidate.id,
        type: "REPORT_READY" as any,
        title: "Your Interview Results",
        message: "Your interview has been evaluated. View your report now.",
        data: { interviewId: interview.id },
      });
    }
  } catch (err) {
    logger.error("[Notification] Failed to notify report ready", { error: err });
  }
}

/**
 * Notify recruiter that an interview was completed.
 */
export async function notifyInterviewCompleted(
  interviewId: string
): Promise<void> {
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        candidate: { select: { fullName: true } },
        recruiter: { select: { supabaseUserId: true } },
      },
    });

    if (!interview?.recruiter.supabaseUserId) return;

    await createNotification({
      userId: interview.recruiter.supabaseUserId,
      type: "INTERVIEW_COMPLETED" as any,
      title: "Interview Completed",
      message: `${interview.candidate.fullName} has completed their interview. A report is being generated.`,
      data: { interviewId: interview.id },
    });
  } catch (err) {
    logger.error("[Notification] Failed to notify interview completed", { error: err });
  }
}

/**
 * Interview Notifications
 *
 * Sends post-interview notification emails to recruiters and candidates.
 * Extracted from report-generator.ts for reuse in Inngest jobs.
 */

import { prisma } from "@/lib/prisma";
import { sendReportReadyEmail } from "@/lib/email/report-ready";
import { sendCandidateFeedbackEmail } from "@/lib/email/candidate-feedback";
import { logger } from "@/lib/logger";

export async function sendInterviewNotifications(
  interviewId: string
): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      candidate: {
        select: { fullName: true, email: true },
      },
      recruiter: {
        select: { name: true, email: true },
      },
      report: {
        select: {
          overallScore: true,
          recommendation: true,
          strengths: true,
        },
      },
    },
  });

  if (!interview?.report) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const reportUrl = `${baseUrl}/interviews/${interviewId}/report`;

  // Recruiter notification
  if (interview.recruiter?.email) {
    try {
      await sendReportReadyEmail({
        recruiterEmail: interview.recruiter.email,
        recruiterName: interview.recruiter.name,
        candidateName: interview.candidate.fullName,
        interviewType: interview.type,
        overallScore: interview.report.overallScore,
        recommendation: interview.report.recommendation,
        reportUrl,
      });
    } catch (err) {
      logger.error("Failed to send recruiter report email", { error: err });
    }
  }

  // Candidate feedback (strengths only — no scores)
  if (interview.candidate.email) {
    try {
      await sendCandidateFeedbackEmail({
        candidateEmail: interview.candidate.email,
        candidateName: interview.candidate.fullName,
        strengths: (interview.report.strengths as string[]) || [],
      });
    } catch (err) {
      logger.error("Failed to send candidate feedback email", { error: err });
    }
  }
}

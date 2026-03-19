import { prisma } from "@/lib/prisma";
import { generateInterviewReport, SCORER_MODEL_VERSION, getScorerPromptHash } from "@/lib/gemini";
import { getSkillModulesHash } from "@/lib/skill-modules";
import { sendReportReadyEmail } from "@/lib/email/report-ready";
import { sendCandidateFeedbackEmail } from "@/lib/email/candidate-feedback";

/**
 * Generate an interview report in the background after interview completion.
 * Tracks report status and supports retry on failure.
 */
export async function generateReportInBackground(
  interviewId: string
): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          email: true,
          currentTitle: true,
          currentCompany: true,
          skills: true,
          experienceYears: true,
          resumeText: true,
        },
      },
      recruiter: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      report: true,
    },
  });

  if (!interview || interview.report || !interview.transcript) {
    return;
  }

  // Mark report as generating
  await prisma.interview.update({
    where: { id: interviewId },
    data: { reportStatus: "generating" },
  });

  try {
    const reportData = await generateInterviewReport(
      interview.transcript as any[],
      {
        fullName: interview.candidate.fullName,
        currentTitle: interview.candidate.currentTitle,
        currentCompany: interview.candidate.currentCompany,
        skills: interview.candidate.skills as string[],
        experienceYears: interview.candidate.experienceYears,
        resumeText: interview.candidate.resumeText,
      },
      interview.integrityEvents as any[] | null
    );

    await prisma.interviewReport.create({
      data: {
        interviewId,
        technicalSkills: reportData.technicalSkills,
        softSkills: reportData.softSkills,
        domainExpertise: reportData.domainExpertise,
        clarityStructure: reportData.clarityStructure,
        problemSolving: reportData.problemSolving,
        communicationScore: reportData.communicationScore,
        measurableImpact: reportData.measurableImpact,
        summary: reportData.summary,
        strengths: reportData.strengths,
        areasToImprove: reportData.areasToImprove,
        recommendation: reportData.recommendation,
        hiringAdvice: reportData.hiringAdvice,
        overallScore: reportData.overallScore,
        integrityScore: reportData.integrityScore,
        integrityFlags: reportData.integrityFlags,
        scorerModelVersion: SCORER_MODEL_VERSION,
        scorerPromptVersion: getScorerPromptHash(),
        rubricVersion: getSkillModulesHash(),
      },
    });

    const overallScore = reportData.overallScore || null;

    // Include per-module scores and recording URL if available
    const updateData: Record<string, unknown> = {
      overallScore,
      reportStatus: "completed",
    };

    // Get recording URL if one exists
    try {
      const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
      const recordingUrl = await getSignedPlaybackUrl(interviewId);
      if (recordingUrl) {
        updateData.recordingUrl = recordingUrl;
      }
    } catch {
      // R2 not configured — skip recording URL
    }

    await prisma.interview.update({
      where: { id: interviewId },
      data: updateData,
    });

    await prisma.candidate.update({
      where: { id: interview.candidateId },
      data: {
        ariaInterviewed: true,
        ariaOverallScore: overallScore,
      },
    });

    // Send notification emails (non-blocking — don't fail if email fails)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const reportUrl = `${baseUrl}/interviews/${interviewId}/report`;

    // D2: Recruiter notification
    if (interview.recruiter?.email) {
      sendReportReadyEmail({
        recruiterEmail: interview.recruiter.email,
        recruiterName: interview.recruiter.name,
        candidateName: interview.candidate.fullName,
        interviewType: interview.type,
        overallScore: reportData.overallScore,
        recommendation: reportData.recommendation,
        reportUrl,
      }).catch((err) =>
        console.error("Failed to send recruiter report email:", err)
      );
    }

    // D3: Candidate feedback (strengths only — no scores)
    if (interview.candidate.email) {
      sendCandidateFeedbackEmail({
        candidateEmail: interview.candidate.email,
        candidateName: interview.candidate.fullName,
        strengths: reportData.strengths || [],
      }).catch((err) =>
        console.error("Failed to send candidate feedback email:", err)
      );
    }
  } catch (error) {
    console.error(`Report generation failed for interview ${interviewId}:`, error);

    const currentRetryCount = interview.reportRetryCount ?? 0;
    const newRetryCount = currentRetryCount + 1;

    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        reportRetryCount: newRetryCount,
        reportStatus: newRetryCount >= 3 ? "failed" : "pending",
      },
    });
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MINUTES = 5;

/**
 * Find interviews with failed report generation that are eligible for retry
 * and attempt to regenerate their reports.
 */
export async function retryFailedReports(): Promise<void> {
  const cutoff = new Date(Date.now() - RETRY_DELAY_MINUTES * 60 * 1000);

  const interviews = await prisma.interview.findMany({
    where: {
      reportStatus: "pending",
      reportRetryCount: { gt: 0, lt: MAX_RETRIES },
      completedAt: { lt: cutoff },
      report: null,
    },
    select: { id: true },
  });

  console.log(`Retrying report generation for ${interviews.length} interview(s)`);

  for (const interview of interviews) {
    try {
      await generateReportInBackground(interview.id);
    } catch (error) {
      console.error(`Retry failed for interview ${interview.id}:`, error);
    }
  }
}

import { prisma } from "@/lib/prisma";
import { generateInterviewReport, SCORER_MODEL_VERSION, getScorerPromptHash } from "@/lib/gemini";
import { getSkillModulesHash } from "@/lib/skill-modules";
import { sendReportReadyEmail } from "@/lib/email/report-ready";
import { sendCandidateFeedbackEmail } from "@/lib/email/candidate-feedback";
import { computeEvidenceHash } from "@/lib/evidence-hash";
import * as Sentry from "@sentry/nextjs";

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
      job: {
        select: {
          title: true,
          description: true,
          skillsRequired: true,
        },
      },
      hypotheses: true,
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
    // Build report generation options with hypotheses and job context
    const reportOptions: Parameters<typeof generateInterviewReport>[3] = {
      hypotheses: interview.hypotheses?.map((h: { hypothesis: string; source: string }) => ({
        hypothesis: h.hypothesis,
        source: h.source,
      })),
      mode: interview.mode,
    };

    // Add job context for JOB_FIT and HYBRID modes
    if (interview.job) {
      reportOptions.jobTitle = interview.job.title;
      reportOptions.jobDescription = interview.job.description || undefined;
      reportOptions.jobSkillsRequired = (interview.job.skillsRequired as string[]) || undefined;
    }

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
      interview.integrityEvents as any[] | null,
      reportOptions
    );

    // P0.4: Compute deterministic integrity score from ProctoringEvent rows
    const proctoringEvents = await prisma.proctoringEvent.findMany({
      where: { interviewId },
      select: { eventType: true, severity: true },
    });

    let computedIntegrityScore = 100;
    const severityDeductions: Record<string, number> = {
      CRITICAL: 20,
      HIGH: 10,
      MEDIUM: 5,
      LOW: 2,
    };
    const eventCounts: Record<string, number> = {};
    for (const event of proctoringEvents) {
      computedIntegrityScore -= severityDeductions[event.severity] || 2;
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
    }
    computedIntegrityScore = Math.max(0, computedIntegrityScore);

    // Build human-readable integrity flags
    const computedFlags = Object.entries(eventCounts).map(
      ([type, count]) => `${type.replace(/_/g, " ")} (${count}x)`
    );

    // Use the lower of AI-assessed and computed scores for safety
    const finalIntegrityScore = reportData.integrityScore != null
      ? Math.min(reportData.integrityScore, computedIntegrityScore)
      : computedIntegrityScore;
    const finalIntegrityFlags = [
      ...(Array.isArray(reportData.integrityFlags) ? reportData.integrityFlags : []),
      ...computedFlags,
    ].filter(Boolean);

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
        integrityScore: finalIntegrityScore,
        integrityFlags: finalIntegrityFlags,
        scorerModelVersion: SCORER_MODEL_VERSION,
        scorerPromptVersion: getScorerPromptHash(),
        rubricVersion: getSkillModulesHash(),
        // Phase 1: Enhanced fields
        professionalExperience: reportData.professionalExperience,
        roleFit: reportData.roleFit,
        culturalFit: reportData.culturalFit,
        thinkingJudgment: reportData.thinkingJudgment,
        confidenceLevel: reportData.confidenceLevel,
        headline: reportData.headline,
        riskSignals: reportData.riskSignals as any,
        hypothesisOutcomes: reportData.hypothesisOutcomes as any,
        evidenceHighlights: reportData.evidenceHighlights as any,
        jobMatchScore: reportData.jobMatchScore,
        requirementMatches: reportData.requirementMatches as any,
        environmentFitNotes: reportData.environmentFitNotes,
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

    // P1.3: Compute evidence hash for tamper detection
    try {
      const evidenceHash = computeEvidenceHash(
        interview.transcript,
        {
          overallScore: reportData.overallScore,
          recommendation: reportData.recommendation,
          summary: reportData.summary,
          domainExpertise: reportData.domainExpertise,
          problemSolving: reportData.problemSolving,
          communicationScore: reportData.communicationScore,
          integrityScore: finalIntegrityScore,
        },
        (updateData.recordingUrl as string) || null
      );
      await prisma.interviewReport.update({
        where: { interviewId },
        data: { evidenceHash },
      });
    } catch {
      // Non-critical — don't fail report generation for hash computation
    }

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
    Sentry.captureException(error, { tags: { component: "report_generator" }, extra: { interviewId } });
    console.error(`Report generation failed for interview ${interviewId}:`, error);

    const currentRetryCount = interview.reportRetryCount ?? 0;
    const newRetryCount = currentRetryCount + 1;

    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        reportRetryCount: newRetryCount,
        reportStatus: newRetryCount >= MAX_RETRIES ? "failed" : "pending",
      },
    });
  }
}

const MAX_RETRIES = 5;
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Calculate exponential backoff delay for retries.
 * Retry 1: 2min, Retry 2: 4min, Retry 3: 8min, Retry 4: 16min
 */
function getRetryDelayMinutes(retryCount: number): number {
  return Math.pow(2, retryCount); // 2, 4, 8, 16, 32
}

/**
 * Recover stuck reports: reports stuck in "generating" for >10 minutes
 * are reset to "pending" so they can be retried.
 */
export async function recoverStuckReports(): Promise<{ recovered: number }> {
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuckReports = await prisma.interview.findMany({
    where: {
      reportStatus: "generating",
      updatedAt: { lt: stuckCutoff },
      report: null,
    },
    select: { id: true, reportRetryCount: true },
  });

  let recovered = 0;
  for (const interview of stuckReports) {
    const retryCount = (interview.reportRetryCount ?? 0) + 1;
    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        reportStatus: retryCount >= MAX_RETRIES ? "failed" : "pending",
        reportRetryCount: retryCount,
      },
    });
    recovered++;
  }

  if (recovered > 0) {
    console.log(`Recovered ${recovered} stuck report(s)`);
  }

  return { recovered };
}

/**
 * Find interviews with failed report generation that are eligible for retry
 * (with exponential backoff) and attempt to regenerate their reports.
 */
export async function retryFailedReports(): Promise<void> {
  // First, recover any stuck reports
  await recoverStuckReports();

  const interviews = await prisma.interview.findMany({
    where: {
      reportStatus: "pending",
      reportRetryCount: { gt: 0, lt: MAX_RETRIES },
      report: null,
    },
    select: { id: true, reportRetryCount: true, updatedAt: true },
  });

  let retried = 0;
  for (const interview of interviews) {
    // Exponential backoff: check if enough time has passed since last attempt
    const delayMinutes = getRetryDelayMinutes(interview.reportRetryCount ?? 1);
    const eligibleAt = new Date(interview.updatedAt.getTime() + delayMinutes * 60 * 1000);

    if (new Date() < eligibleAt) {
      continue; // Not yet eligible for retry
    }

    try {
      await generateReportInBackground(interview.id);
      retried++;
    } catch (error) {
      console.error(`Retry failed for interview ${interview.id}:`, error);
    }
  }

  if (retried > 0) {
    console.log(`Retried report generation for ${retried} interview(s)`);
  }
}

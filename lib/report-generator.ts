import { prisma } from "@/lib/prisma";
import { generateInterviewReport } from "@/lib/gemini";
import { sendReportReadyEmail } from "@/lib/email/report-ready";
import { sendCandidateFeedbackEmail } from "@/lib/email/candidate-feedback";

/**
 * Generate an interview report in the background after interview completion.
 * Fire-and-forget — errors are logged but don't block the caller.
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
    },
  });

  const overallScore = reportData.overallScore || null;

  await prisma.interview.update({
    where: { id: interviewId },
    data: { overallScore },
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
}

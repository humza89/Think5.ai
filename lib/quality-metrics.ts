/**
 * Quality Metrics Computation
 *
 * Extracted from report-generator.ts for reuse in Inngest jobs.
 * Computes interview quality metrics: depth, coverage, follow-ups, etc.
 */

import { prisma } from "@/lib/prisma";

export async function computeQualityMetrics(
  interviewId: string
): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      transcript: true,
      interviewPlan: true,
    },
  });

  if (!interview) return;

  const transcript = interview.transcript as
    | Array<{ role: string; content: string }>
    | null;
  if (!transcript?.length) return;

  const candidateMessages = transcript.filter((m) => m.role === "candidate");
  const interviewerMessages = transcript.filter(
    (m) => m.role === "interviewer"
  );
  const totalQuestions = interviewerMessages.length;

  const planSections = (
    interview.interviewPlan as { sections?: unknown[] } | null
  )?.sections;
  const followUpQuestions = Math.max(
    0,
    totalQuestions - (planSections?.length || 0)
  );

  // Average response depth (word count)
  const avgResponseDepth =
    candidateMessages.length > 0
      ? candidateMessages.reduce(
          (sum: number, m: { content: string }) =>
            sum + (m.content?.split(/\s+/).length || 0),
          0
        ) / candidateMessages.length
      : 0;

  // Coverage percentage
  const plan = interview.interviewPlan as {
    sections?: unknown[];
    totalQuestions?: number;
  } | null;
  const coveragePercentage = plan?.totalQuestions
    ? Math.min(100, (totalQuestions / plan.totalQuestions) * 100)
    : null;

  // Composite depth score
  const depthScore = Math.min(
    100,
    Math.round(
      Math.min(avgResponseDepth / 100, 1) * 40 +
        Math.min(followUpQuestions / 5, 1) * 30 +
        ((coveragePercentage || 50) / 100) * 30
    )
  );

  await prisma.interviewQualityMetrics.upsert({
    where: { interviewId },
    create: {
      interviewId,
      totalQuestions,
      followUpQuestions,
      avgResponseDepth,
      topicTransitions: plan?.sections?.length || 0,
      coveragePercentage,
      depthScore,
      personalizationScore: interview.interviewPlan ? 80 : 40,
    },
    update: {
      totalQuestions,
      followUpQuestions,
      avgResponseDepth,
      coveragePercentage,
      depthScore,
    },
  });
}

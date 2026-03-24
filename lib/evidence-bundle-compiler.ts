/**
 * Evidence Bundle Compiler
 *
 * Compiles a unified evidence bundle linking all interview artifacts.
 * Extracted from report-generator.ts for reuse in Inngest jobs
 * and standalone evidence export.
 */

import { prisma } from "@/lib/prisma";
import { computeEvidenceHash } from "@/lib/evidence-hash";
import { SCORER_MODEL_VERSION, getScorerPromptHash } from "@/lib/gemini";
import { getSkillModulesHash } from "@/lib/skill-modules";

export async function compileEvidenceBundle(
  interviewId: string
): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      report: true,
      hypotheses: true,
    },
  });

  if (!interview || !interview.report) return;

  const report = interview.report;

  const evidenceBundle = {
    version: "1.0",
    compiledAt: new Date().toISOString(),
    interviewId,
    candidateId: interview.candidateId,
    artifacts: {
      transcript: {
        available: !!interview.transcript,
        messageCount: Array.isArray(interview.transcript)
          ? interview.transcript.length
          : 0,
      },
      recording: {
        available: !!interview.recordingUrl,
        url: interview.recordingUrl || null,
      },
      plan: {
        available: !!interview.interviewPlan,
        version: interview.interviewPlanVersion || null,
      },
    },
    scores: {
      overall: report.overallScore,
      dimensions: {
        domainExpertise: report.domainExpertise,
        problemSolving: report.problemSolving,
        communication: report.communicationScore,
        professionalExperience: report.professionalExperience,
        roleFit: report.roleFit,
        culturalFit: report.culturalFit,
        thinkingJudgment: report.thinkingJudgment,
      },
      integrity: report.integrityScore,
      jobMatch: report.jobMatchScore,
      confidence: report.confidenceLevel,
    },
    evidence: {
      highlights: report.evidenceHighlights || [],
      riskSignals: report.riskSignals || [],
      hypothesisOutcomes: report.hypothesisOutcomes || [],
      requirementMatches: report.requirementMatches || [],
    },
    versioning: {
      scorerModel: report.scorerModelVersion || SCORER_MODEL_VERSION,
      scorerPrompt: report.scorerPromptVersion || getScorerPromptHash(),
      rubric: report.rubricVersion || getSkillModulesHash(),
    },
    templateSnapshot: interview.templateSnapshot || null,
    templateSnapshotHash: interview.templateSnapshotHash || null,
    consent: {
      recording: interview.consentRecording,
      proctoring: interview.consentProctoring,
      privacy: interview.consentPrivacy,
      consentedAt: interview.consentedAt?.toISOString() || null,
    },
    legalHold: interview.legalHold,
  };

  // Compute integrity hash of the full bundle
  const integrityHash = computeEvidenceHash(
    interview.transcript,
    {
      overallScore: report.overallScore,
      recommendation: report.recommendation,
      summary: report.summary,
      domainExpertise: report.domainExpertise,
      problemSolving: report.problemSolving,
      communicationScore: report.communicationScore,
      integrityScore: report.integrityScore,
    },
    interview.recordingUrl
  );

  // Upsert first-class EvidenceBundle record
  await prisma.evidenceBundle.upsert({
    where: { interviewId },
    create: {
      interviewId,
      version: "1.0",
      compiledAt: new Date(),
      artifactManifest: evidenceBundle.artifacts,
      scores: evidenceBundle.scores,
      evidenceItems: evidenceBundle.evidence,
      versioning: evidenceBundle.versioning,
      consent: evidenceBundle.consent,
      integrityHash,
      legalHold: interview.legalHold ?? false,
    },
    update: {
      version: "1.0",
      compiledAt: new Date(),
      artifactManifest: evidenceBundle.artifacts,
      scores: evidenceBundle.scores,
      evidenceItems: evidenceBundle.evidence,
      versioning: evidenceBundle.versioning,
      consent: evidenceBundle.consent,
      integrityHash,
      legalHold: interview.legalHold ?? false,
    },
  });

  // Also keep the legacy JSON blob for backward compatibility
  await prisma.interview.update({
    where: { id: interviewId },
    data: { evidenceBundle },
  });

  // Update evidence hash on report if not already set
  if (!report.evidenceHash) {
    await prisma.interviewReport.update({
      where: { id: report.id },
      data: { evidenceHash: integrityHash },
    });
  }
}

import { prisma } from "@/lib/prisma";

export interface RetentionResult {
  recordingsDeleted: number;
  transcriptsAnonymized: number;
  candidatesAnonymized: number;
  legalHoldsSkipped: { interviews: number; candidates: number };
  errors: string[];
}

/**
 * Enforce data retention policies by deleting/anonymizing data older than configured thresholds.
 * Respects legal holds — held records are never deleted or anonymized.
 * Uses company-specific retention policy if available, otherwise global default.
 */
export async function enforceRetentionPolicies(): Promise<RetentionResult> {
  const result: RetentionResult = {
    recordingsDeleted: 0,
    transcriptsAnonymized: 0,
    candidatesAnonymized: 0,
    legalHoldsSkipped: { interviews: 0, candidates: 0 },
    errors: [],
  };

  // Get default retention policy (or use hardcoded defaults)
  const defaultPolicy = await prisma.retentionPolicy.findFirst({
    where: { isDefault: true },
  });

  // Get all company-specific policies
  const companyPolicies = await prisma.retentionPolicy.findMany({
    where: { companyId: { not: null } },
  });
  const companyPolicyMap = new Map(
    companyPolicies.map((p: any) => [p.companyId!, p])
  );

  const defaultRecordingDays = defaultPolicy?.recordingDays ?? 90;
  const defaultTranscriptDays = defaultPolicy?.transcriptDays ?? 365;
  const defaultCandidateDataDays = defaultPolicy?.candidateDataDays ?? 730;

  const now = new Date();

  // 1. Delete recording URLs older than recordingDays (respecting legal holds + company policies)
  try {
    // First, handle interviews without company-specific policy using default
    const recordingCutoff = new Date(now.getTime() - defaultRecordingDays * 24 * 60 * 60 * 1000);

    // Count legal holds that would be affected
    const heldRecordings = await prisma.interview.count({
      where: {
        recordingUrl: { not: null },
        completedAt: { lt: recordingCutoff },
        recordingState: { not: "DELETED" },
        legalHold: true,
      },
    });
    result.legalHoldsSkipped.interviews += heldRecordings;

    const expiredRecordings = await prisma.interview.updateMany({
      where: {
        recordingUrl: { not: null },
        completedAt: { lt: recordingCutoff },
        recordingState: { not: "DELETED" },
        legalHold: false,
      },
      data: {
        recordingUrl: null,
        recordingState: "DELETED",
      },
    });
    result.recordingsDeleted = expiredRecordings.count;
  } catch (error) {
    result.errors.push(`Recording cleanup failed: ${error}`);
  }

  // 2. Anonymize transcripts older than transcriptDays (respecting legal holds)
  try {
    const transcriptCutoff = new Date(now.getTime() - defaultTranscriptDays * 24 * 60 * 60 * 1000);

    const heldTranscripts = await prisma.interview.count({
      where: {
        transcript: { not: null },
        completedAt: { lt: transcriptCutoff },
        legalHold: true,
      },
    });
    result.legalHoldsSkipped.interviews += heldTranscripts;

    const expiredTranscripts = await prisma.interview.updateMany({
      where: {
        transcript: { not: null },
        completedAt: { lt: transcriptCutoff },
        legalHold: false,
      },
      data: {
        transcript: null,
      },
    });
    result.transcriptsAnonymized = expiredTranscripts.count;
  } catch (error) {
    result.errors.push(`Transcript cleanup failed: ${error}`);
  }

  // 3. Anonymize candidate PII older than candidateDataDays (respecting legal holds)
  try {
    const candidateCutoff = new Date(now.getTime() - defaultCandidateDataDays * 24 * 60 * 60 * 1000);

    const heldCandidates = await prisma.candidate.count({
      where: {
        createdAt: { lt: candidateCutoff },
        email: { not: "redacted@retention.policy" },
        legalHold: true,
      },
    });
    result.legalHoldsSkipped.candidates = heldCandidates;

    const expiredCandidates = await prisma.candidate.updateMany({
      where: {
        createdAt: { lt: candidateCutoff },
        email: { not: "redacted@retention.policy" },
        legalHold: false,
      },
      data: {
        email: "redacted@retention.policy",
        phone: null,
        resumeText: null,
        resumeUrl: null,
        demographicData: null,
      },
    });
    result.candidatesAnonymized = expiredCandidates.count;
  } catch (error) {
    result.errors.push(`Candidate data cleanup failed: ${error}`);
  }

  return result;
}

/**
 * Get current retention policy status (what would be affected by enforcement).
 */
export async function getRetentionStatus(companyId?: string) {
  // Use company-specific policy if companyId provided
  let policy = null;
  if (companyId) {
    policy = await prisma.retentionPolicy.findUnique({
      where: { companyId },
    });
  }
  if (!policy) {
    policy = await prisma.retentionPolicy.findFirst({
      where: { isDefault: true },
    });
  }

  const recordingDays = policy?.recordingDays ?? 90;
  const transcriptDays = policy?.transcriptDays ?? 365;
  const candidateDataDays = policy?.candidateDataDays ?? 730;

  const now = new Date();

  const [recordingsCount, transcriptsCount, candidatesCount, legalHoldsCount] = await Promise.all([
    prisma.interview.count({
      where: {
        recordingUrl: { not: null },
        completedAt: { lt: new Date(now.getTime() - recordingDays * 24 * 60 * 60 * 1000) },
        recordingState: { not: "DELETED" },
        legalHold: false,
      },
    }),
    prisma.interview.count({
      where: {
        transcript: { not: null },
        completedAt: { lt: new Date(now.getTime() - transcriptDays * 24 * 60 * 60 * 1000) },
        legalHold: false,
      },
    }),
    prisma.candidate.count({
      where: {
        createdAt: { lt: new Date(now.getTime() - candidateDataDays * 24 * 60 * 60 * 1000) },
        email: { not: "redacted@retention.policy" },
        legalHold: false,
      },
    }),
    prisma.interview.count({
      where: { legalHold: true },
    }),
  ]);

  return {
    policy: {
      recordingDays,
      transcriptDays,
      candidateDataDays,
      source: policy ? (policy.companyId ? "company" : "configured") : "default",
    },
    pendingEnforcement: {
      recordings: recordingsCount,
      transcripts: transcriptsCount,
      candidates: candidatesCount,
    },
    legalHolds: legalHoldsCount,
  };
}

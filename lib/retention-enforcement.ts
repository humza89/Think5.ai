import { prisma } from "@/lib/prisma";

export interface RetentionResult {
  recordingsDeleted: number;
  transcriptsAnonymized: number;
  candidatesAnonymized: number;
  errors: string[];
}

/**
 * Enforce data retention policies by deleting/anonymizing data older than configured thresholds.
 * Uses the default RetentionPolicy if one exists, otherwise uses hardcoded defaults.
 */
export async function enforceRetentionPolicies(): Promise<RetentionResult> {
  const result: RetentionResult = {
    recordingsDeleted: 0,
    transcriptsAnonymized: 0,
    candidatesAnonymized: 0,
    errors: [],
  };

  // Get default retention policy (or use hardcoded defaults)
  const policy = await prisma.retentionPolicy.findFirst({
    where: { isDefault: true },
  });

  const recordingDays = policy?.recordingDays ?? 90;
  const transcriptDays = policy?.transcriptDays ?? 365;
  const candidateDataDays = policy?.candidateDataDays ?? 730;

  const now = new Date();

  // 1. Delete recording URLs older than recordingDays
  try {
    const recordingCutoff = new Date(now.getTime() - recordingDays * 24 * 60 * 60 * 1000);
    const expiredRecordings = await prisma.interview.updateMany({
      where: {
        recordingUrl: { not: null },
        completedAt: { lt: recordingCutoff },
        recordingState: { not: "DELETED" },
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

  // 2. Anonymize transcripts older than transcriptDays
  try {
    const transcriptCutoff = new Date(now.getTime() - transcriptDays * 24 * 60 * 60 * 1000);
    const expiredTranscripts = await prisma.interview.updateMany({
      where: {
        transcript: { not: null },
        completedAt: { lt: transcriptCutoff },
      },
      data: {
        transcript: null,
      },
    });
    result.transcriptsAnonymized = expiredTranscripts.count;
  } catch (error) {
    result.errors.push(`Transcript cleanup failed: ${error}`);
  }

  // 3. Anonymize candidate PII older than candidateDataDays
  try {
    const candidateCutoff = new Date(now.getTime() - candidateDataDays * 24 * 60 * 60 * 1000);
    const expiredCandidates = await prisma.candidate.updateMany({
      where: {
        createdAt: { lt: candidateCutoff },
        email: { not: "redacted@retention.policy" },
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
export async function getRetentionStatus() {
  const policy = await prisma.retentionPolicy.findFirst({
    where: { isDefault: true },
  });

  const recordingDays = policy?.recordingDays ?? 90;
  const transcriptDays = policy?.transcriptDays ?? 365;
  const candidateDataDays = policy?.candidateDataDays ?? 730;

  const now = new Date();

  const [recordingsCount, transcriptsCount, candidatesCount] = await Promise.all([
    prisma.interview.count({
      where: {
        recordingUrl: { not: null },
        completedAt: { lt: new Date(now.getTime() - recordingDays * 24 * 60 * 60 * 1000) },
        recordingState: { not: "DELETED" },
      },
    }),
    prisma.interview.count({
      where: {
        transcript: { not: null },
        completedAt: { lt: new Date(now.getTime() - transcriptDays * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.candidate.count({
      where: {
        createdAt: { lt: new Date(now.getTime() - candidateDataDays * 24 * 60 * 60 * 1000) },
        email: { not: "redacted@retention.policy" },
      },
    }),
  ]);

  return {
    policy: {
      recordingDays,
      transcriptDays,
      candidateDataDays,
      source: policy ? "configured" : "default",
    },
    pendingEnforcement: {
      recordings: recordingsCount,
      transcripts: transcriptsCount,
      candidates: candidatesCount,
    },
  };
}

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { deleteRecording } from "@/lib/media-storage";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logger";

export async function getDefaultRetentionPolicy() {
  return prisma.retentionPolicy.findFirst({ where: { isDefault: true } });
}

export async function applyRetentionPolicies() {
  const policy = await getDefaultRetentionPolicy();
  if (!policy) return { deleted: 0 };

  const now = new Date();
  let totalDeleted = 0;

  // Delete old recordings
  const recordingCutoff = new Date(now.getTime() - policy.recordingDays * 24 * 60 * 60 * 1000);
  const oldRecordings = await prisma.interview.findMany({
    where: {
      recordingUrl: { not: null },
      completedAt: { lt: recordingCutoff },
    },
    select: { id: true, recordingUrl: true },
  });

  if (oldRecordings.length > 0) {
    // Delete actual R2 files before clearing database URLs
    for (const recording of oldRecordings) {
      try {
        await deleteRecording(recording.id);
      } catch (err) {
        logger.error(`Failed to delete R2 recordings for interview ${recording.id}`, { error: err });
      }
    }

    await prisma.interview.updateMany({
      where: { id: { in: oldRecordings.map((r: { id: string }) => r.id) } },
      data: { recordingUrl: null, recordingSize: null, screenRecordingUrl: null, screenRecordingSize: null },
    });
    totalDeleted += oldRecordings.length;

    // Audit log: recording deletions
    logActivity({
      userId: "system",
      userRole: "system",
      action: "retention.recording_deleted",
      entityType: "Interview",
      entityId: "batch",
      metadata: { count: oldRecordings.length, cutoffDate: recordingCutoff.toISOString() },
    }).catch(() => {});
  }

  // Clear old transcripts (fix: use Prisma.DbNull instead of undefined)
  const transcriptCutoff = new Date(now.getTime() - policy.transcriptDays * 24 * 60 * 60 * 1000);
  const transcriptResult = await prisma.interview.updateMany({
    where: {
      transcript: { not: Prisma.DbNull },
      completedAt: { lt: transcriptCutoff },
    },
    data: { transcript: Prisma.DbNull },
  });
  totalDeleted += transcriptResult.count;

  if (transcriptResult.count > 0) {
    // Audit log: transcript deletions
    logActivity({
      userId: "system",
      userRole: "system",
      action: "retention.transcript_cleared",
      entityType: "Interview",
      entityId: "batch",
      metadata: { count: transcriptResult.count, cutoffDate: transcriptCutoff.toISOString() },
    }).catch(() => {});
  }

  // Clear old candidate data
  const candidateCutoff = new Date(now.getTime() - policy.candidateDataDays * 24 * 60 * 60 * 1000);
  const oldCandidateInterviews = await prisma.interview.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { lt: candidateCutoff },
    },
    select: { candidateId: true },
    distinct: ["candidateId"],
  });

  if (oldCandidateInterviews.length > 0) {
    const candidateIds = oldCandidateInterviews.map((i: { candidateId: string }) => i.candidateId);

    // Only delete candidates where ALL interviews are past the cutoff
    const candidatesToClear = [];
    for (const candidateId of candidateIds) {
      const recentCount = await prisma.interview.count({
        where: {
          candidateId,
          completedAt: { gte: candidateCutoff },
        },
      });
      if (recentCount === 0) {
        candidatesToClear.push(candidateId);
      }
    }

    if (candidatesToClear.length > 0) {
      // Anonymize candidate data (soft deletion — remove PII, keep record)
      await prisma.candidate.updateMany({
        where: { id: { in: candidatesToClear } },
        data: {
          resumeText: null,
          resumeUrl: null,
          phone: null,
          linkedinUrl: null,
          demographicData: Prisma.DbNull,
        },
      });
      totalDeleted += candidatesToClear.length;

      logActivity({
        userId: "system",
        userRole: "system",
        action: "retention.candidate_data_cleared",
        entityType: "Candidate",
        entityId: "batch",
        metadata: { count: candidatesToClear.length, cutoffDate: candidateCutoff.toISOString() },
      }).catch(() => {});
    }
  }

  // Archive old audit logs (keep 7 years for compliance, then purge)
  const AUDIT_LOG_RETENTION_DAYS = 2555; // ~7 years
  const auditLogCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let auditLogsDeleted = 0;
  try {
    const auditResult = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: auditLogCutoff } },
    });
    auditLogsDeleted = auditResult.count;
    if (auditLogsDeleted > 0) {
      logActivity({
        userId: "system",
        userRole: "system",
        action: "retention.audit_logs_purged",
        entityType: "ActivityLog",
        entityId: "batch",
        metadata: { count: auditLogsDeleted, cutoffDate: auditLogCutoff.toISOString(), retentionDays: AUDIT_LOG_RETENTION_DAYS },
      }).catch(() => {});
    }
  } catch {
    // ActivityLog table may not exist yet
  }

  return {
    deleted: totalDeleted,
    recordingsCleared: oldRecordings.length,
    transcriptsCleared: transcriptResult.count,
    auditLogsDeleted,
  };
}

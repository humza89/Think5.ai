import { prisma } from "@/lib/prisma";

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
    await prisma.interview.updateMany({
      where: { id: { in: oldRecordings.map((r: { id: string }) => r.id) } },
      data: { recordingUrl: null, recordingSize: null, screenRecordingUrl: null, screenRecordingSize: null },
    });
    totalDeleted += oldRecordings.length;
  }

  // Clear old transcripts
  const transcriptCutoff = new Date(now.getTime() - policy.transcriptDays * 24 * 60 * 60 * 1000);
  const transcriptResult = await prisma.interview.updateMany({
    where: {
      transcript: { not: undefined },
      completedAt: { lt: transcriptCutoff },
    },
    data: { transcript: undefined },
  });
  totalDeleted += transcriptResult.count;

  return { deleted: totalDeleted, recordingsCleared: oldRecordings.length, transcriptsCleared: transcriptResult.count };
}

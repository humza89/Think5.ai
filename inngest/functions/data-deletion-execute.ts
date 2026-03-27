/**
 * DSAR Data Deletion — Durable Inngest Function
 *
 * Waits for grace period to expire, then permanently deletes
 * candidate data (recordings, transcripts, PII).
 *
 * GDPR Article 17 — Right to Erasure
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dataDeletionExecute = inngest.createFunction(
  {
    id: "data-deletion-execute",
    retries: 3,
    triggers: [{ event: "candidate/deletion.requested" }],
    onFailure: async ({ error }: any) => {
      console.error("[DataDeletion] Permanent failure:", error?.message);
    },
  },
  async ({ event, step }: any) => {
    const { requestId, candidateId, gracePeriodEndsAt } = event.data;

    // Step 1: Wait for grace period to expire
    await step.sleepUntil("wait-grace-period", new Date(gracePeriodEndsAt));

    // Step 2: Re-check that request wasn't cancelled
    const request = await step.run("verify-not-cancelled", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.dataDeletionRequest.findUnique({
        where: { id: requestId },
      });
    });

    if (!request || request.status === "CANCELLED") {
      return { status: "cancelled", message: "Deletion request was cancelled during grace period" };
    }

    // Step 3: Check for legal hold
    const candidate = await step.run("check-legal-hold", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true, legalHold: true, email: true },
      });
    });

    if (candidate?.legalHold) {
      await step.run("mark-held", async () => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.dataDeletionRequest.update({
          where: { id: requestId },
          data: { status: "PENDING", reason: "Paused: legal hold active" },
        });
      });
      return { status: "held", message: "Legal hold active — deletion paused" };
    }

    // Step 4: Mark as processing
    await step.run("mark-processing", async () => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.dataDeletionRequest.update({
        where: { id: requestId },
        data: { status: "PROCESSING" },
      });
    });

    // Step 5: Delete recording artifacts from R2/S3
    const recordingResult = await step.run("delete-recordings", async () => {
      const { prisma } = await import("@/lib/prisma");
      const interviews = await prisma.interview.findMany({
        where: { candidateId, recordingUrl: { not: null } },
        select: { id: true, recordingUrl: true },
      });

      let deleted = 0;
      for (const interview of interviews) {
        try {
          const { deleteRecording } = await import("@/lib/media-storage");
          await deleteRecording(interview.id);
          deleted++;
        } catch {
          // Continue with other deletions
        }
      }

      // Clear recording URLs from DB
      await prisma.interview.updateMany({
        where: { candidateId },
        data: { recordingUrl: null },
      });

      return { recordingsDeleted: deleted, total: interviews.length };
    });

    // Step 6: Anonymize transcripts
    const transcriptResult = await step.run("anonymize-transcripts", async () => {
      const { prisma } = await import("@/lib/prisma");
      const result = await prisma.interview.updateMany({
        where: { candidateId },
        data: { transcript: [] },
      });
      return { transcriptsCleared: result.count };
    });

    // Step 7: Redact candidate PII
    await step.run("redact-candidate-pii", async () => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          email: `redacted+${candidateId.slice(0, 8)}@deletion.dsar`,
          fullName: "[Deleted]",
          phone: null,
          linkedinUrl: null,
          profileImage: null,
          resumeText: null,
          resumeUrl: null,
          location: null,
          headline: null,
          demographicData: null,
          skills: "[]",
          experiences: null,
          education: null,
        },
      });
    });

    // Step 8: Build data manifest and mark complete
    const manifest = await step.run("complete-deletion", async () => {
      const { prisma } = await import("@/lib/prisma");
      const dataManifest = {
        completedAt: new Date().toISOString(),
        recordingsDeleted: recordingResult.recordingsDeleted,
        transcriptsCleared: transcriptResult.transcriptsCleared,
        piiRedacted: true,
        candidateId,
      };

      await prisma.dataDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          dataManifest,
        },
      });

      return dataManifest;
    });

    // Step 9: Audit log
    await step.run("audit-log", async () => {
      const { logInterviewActivity } = await import("@/lib/interview-audit");
      await logInterviewActivity({
        interviewId: candidateId,
        action: "dsar.deletion_completed",
        userId: candidateId,
        userRole: "system",
        metadata: manifest,
      });
    });

    return { status: "completed", manifest };
  }
);

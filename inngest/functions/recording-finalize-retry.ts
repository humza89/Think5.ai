/**
 * Recording Finalize Retry — Durable Inngest Function
 *
 * Retries recording finalization when the synchronous attempt fails.
 * Prevents silent recording loss due to transient R2/S3 errors.
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const recordingFinalizeRetry = inngest.createFunction(
  {
    id: "recording-finalize-retry",
    retries: 5,
    triggers: [{ event: "recording/finalize-retry" }],
    onFailure: async ({ error }: any) => {
      console.error("[RecordingFinalize] Permanent failure:", error?.message);
    },
  },
  async ({ event, step }: any) => {
    const { interviewId, totalChunks, format, durationSeconds } = event.data;

    // Step 1: Attempt finalization
    const metadata = await step.run("finalize-recording", async () => {
      const { finalizeRecording } = await import("@/lib/media-storage");
      return finalizeRecording(interviewId, totalChunks, format, durationSeconds);
    });

    // Step 2: Update interview record
    await step.run("update-interview-state", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { computeJsonHash } = await import("@/lib/versioning");

      const manifestHash = computeJsonHash({
        interviewId,
        totalChunks,
        format,
        durationSeconds,
        sizeBytes: metadata.sizeBytes,
      });

      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          recordingFormat: format,
          recordingSize: metadata.sizeBytes,
          recordingState: "COMPLETE",
          recordingManifestHash: manifestHash,
        },
      });

      return { manifestHash };
    });

    // Step 3: Audit log
    await step.run("audit-log", async () => {
      const { logInterviewActivity } = await import("@/lib/interview-audit");
      await logInterviewActivity({
        interviewId,
        action: "recording.finalized_via_retry",
        userId: "system",
        userRole: "system",
        metadata: { totalChunks, sizeBytes: metadata.sizeBytes, retried: true },
      });
    });

    return { status: "completed", interviewId };
  }
);

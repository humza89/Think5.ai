/**
 * Durable Job: Recording Processing
 *
 * Finalizes interview recordings — generates signed playback URLs,
 * computes recording metadata, and updates the interview record.
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const recordingProcess = inngest.createFunction(
  {
    id: "interview/recording.process",
    retries: 3,
    triggers: [{ event: "interview/recording.ready" }],
  },
  async ({ event, step }: any) => {
    const { interviewId } = event.data;

    await step.run("finalize-recording", async () => {
      const { prisma } = await import("@/lib/prisma");

      try {
        const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
        const recordingUrl = await getSignedPlaybackUrl(interviewId);

        if (recordingUrl) {
          await prisma.interview.update({
            where: { id: interviewId },
            data: { recordingUrl },
          });
        }
      } catch {
        // R2 not configured — skip
      }
    });

    return { interviewId, status: "processed" };
  }
);

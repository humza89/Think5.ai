/**
 * Durable Job: Broken-COMPLETED Interview Detector
 *
 * Hourly reconciliation scan for interviews that are COMPLETED but violate
 * the durability invariants (no durable report, unplayable recording, missing
 * transcript, unfinalised ledger). See lib/broken-completed-detector.ts.
 *
 * Detection only: repair remains with report-generate retries and
 * recording-finalize-retry. Findings are logged (and captured in Sentry) so
 * the exit-gate observation window can see them.
 */

import * as Sentry from "@sentry/nextjs";
import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const brokenCompletedDetector = inngest.createFunction(
  {
    id: "interview/broken-completed.detect",
    retries: 1,
    triggers: [{ cron: "15 * * * *" }], // Hourly at :15
  },
  async ({ step }: any) => {
    const result = await step.run("detect-broken-completed", async () => {
      const { detectBrokenCompletedInterviews } = await import("@/lib/broken-completed-detector");
      const detection = await detectBrokenCompletedInterviews();
      // Keep the step output small: ids + reasons, not full snapshots.
      return {
        scanned: detection.scanned,
        brokenCount: detection.broken.length,
        reasonBreakdown: detection.reasonBreakdown,
        scannedWindow: detection.scannedWindow,
        broken: detection.broken.map((b) => ({ interviewId: b.interviewId, reasons: b.reasons })),
      };
    });

    if (result.brokenCount > 0) {
      await step.run("report-findings", async () => {
        Sentry.captureMessage(`[BrokenCompleted] ${result.brokenCount} broken COMPLETED interview(s)`, {
          level: "error",
          tags: { component: "broken_completed_detector" },
          extra: { reasonBreakdown: result.reasonBreakdown, broken: result.broken },
        });
      });
    }

    return { status: "complete", ...result };
  }
);

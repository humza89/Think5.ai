/**
 * Durable Job: Retention Cleanup
 *
 * Scheduled job that runs daily to enforce data retention policies.
 * Replaces the cron-based approach with durable execution.
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const retentionCleanup = inngest.createFunction(
  {
    id: "interview/retention.cleanup",
    retries: 2,
    triggers: [{ cron: "0 3 * * *" }], // Daily at 3 AM UTC
  },
  async ({ step }: any) => {
    const result = await step.run("apply-retention-policies", async () => {
      const { applyRetentionPolicies } = await import("@/lib/data-retention");
      return applyRetentionPolicies();
    });

    await step.run("retry-failed-reports", async () => {
      const { retryFailedReports } = await import("@/lib/report-generator");
      await retryFailedReports();
    });

    return { status: "complete", retention: result };
  }
);

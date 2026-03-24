/**
 * SLO Check — Periodic SLO monitoring cron job
 *
 * Runs every 5 minutes to check all SLO statuses
 * and alert via Sentry if any are breached.
 */

import { inngest } from "@/inngest/client";
import { checkAndAlertSLOs } from "@/lib/slo-monitor";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const sloCheck = inngest.createFunction(
  {
    id: "slo-health-check",
    name: "SLO Health Check",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }: any) => {
    await step.run("check-all-slos", async () => {
      await checkAndAlertSLOs();
      return { checked: true, timestamp: new Date().toISOString() };
    });
  }
);

/**
 * SLO Check — Periodic SLO monitoring cron job
 *
 * Runs every 5 minutes to check all SLO statuses
 * and alert via Sentry if any are breached.
 */

import { inngest } from "@/inngest/client";
import { checkAndAlertSLOs, recordSLOEvent } from "@/lib/slo-monitor";

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

    // Detect stale IN_PROGRESS sessions (no update in 10+ min) and mark as hard stops
    await step.run("detect-stale-sessions", async () => {
      const { prisma } = await import("@/lib/prisma");
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      const staleSessions = await prisma.interview.findMany({
        where: {
          status: "IN_PROGRESS",
          updatedAt: { lt: staleThreshold },
        },
        select: { id: true },
        take: 50,
      });

      for (const session of staleSessions) {
        await recordSLOEvent("session.hard_stop.rate", false);
        await prisma.interview.update({
          where: { id: session.id },
          data: { status: "DISCONNECTED" },
        });
      }

      return { staleSessionsDetected: staleSessions.length };
    });
  }
);

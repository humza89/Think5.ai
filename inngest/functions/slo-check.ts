/**
 * SLO Check — Periodic SLO monitoring cron job
 *
 * Runs every 5 minutes to check all SLO statuses,
 * alert via Sentry if any are breached, detect stale sessions,
 * and track heartbeat failure rates.
 */

import { inngest } from "@/inngest/client";
import { checkAndAlertSLOs, persistSLOSnapshot, recordSLOEvent } from "@/lib/slo-monitor";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const sloCheck = inngest.createFunction(
  {
    id: "slo-health-check",
    name: "SLO Health Check",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }: any) => {
    const sloResult = await step.run("check-all-slos", async () => {
      await checkAndAlertSLOs();
      return { checked: true, timestamp: new Date().toISOString() };
    });

    // Detect stale IN_PROGRESS sessions (no heartbeat in 2+ min) and force-end them
    const staleResult = await step.run("detect-and-force-end-stale-sessions", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { isSessionAlive, deleteSessionState, releaseSessionLock } = await import("@/lib/session-store");

      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      const staleSessions = await prisma.interview.findMany({
        where: {
          status: "IN_PROGRESS",
          updatedAt: { lt: staleThreshold },
        },
        select: { id: true, updatedAt: true },
        take: 50,
      });

      let forceEnded = 0;
      let heartbeatAlive = 0;

      for (const session of staleSessions) {
        // Double-check via heartbeat before force-ending
        const alive = await isSessionAlive(session.id);
        if (alive) {
          heartbeatAlive++;
          continue;
        }

        // Force-end: mark as CANCELLED, clean up session resources
        await recordSLOEvent("session.hard_stop.rate", false);
        await prisma.interview.update({
          where: { id: session.id },
          data: {
            status: "CANCELLED",
            endedAt: new Date(),
            endReason: "stale_session_force_end",
          },
        });

        // Clean up session state and lock
        await deleteSessionState(session.id).catch(() => {});
        await releaseSessionLock(session.id).catch(() => {});
        forceEnded++;

        console.log(`[SLO] Force-ended stale session ${session.id} (last update: ${session.updatedAt.toISOString()})`);
      }

      return { staleSessions: staleSessions.length, heartbeatAlive, forceEnded };
    });

    // Track heartbeat failure as SLO metric
    await step.run("track-heartbeat-slo", async () => {
      if (staleResult.forceEnded > 0) {
        for (let i = 0; i < staleResult.forceEnded; i++) {
          await recordSLOEvent("session.heartbeat.failure_rate", false);
        }
      }
      if (staleResult.heartbeatAlive > 0) {
        for (let i = 0; i < staleResult.heartbeatAlive; i++) {
          await recordSLOEvent("session.heartbeat.failure_rate", true);
        }
      }
    });

    // Persist daily SLO snapshot for trend analysis (once per run)
    await step.run("persist-slo-snapshot", async () => {
      await persistSLOSnapshot();
      return { snapshotPersisted: true };
    });

    return { ...sloResult, ...staleResult };
  }
);

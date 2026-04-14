/**
 * Broken-Completed Interview Cron — Track 1, Task 6.
 *
 * Runs every 5 minutes (configured via vercel.json). Scans the last 24h
 * of COMPLETED interviews for the durability invariants in
 * lib/broken-completed-detector.ts, logs a summary, and emits a Sentry
 * alert if anything is found. This is the reconciliation layer the
 * enterprise audit asked for — today, half-finalized interviews can sit
 * in COMPLETED forever with no component responsible for noticing.
 *
 * The cron intentionally does NOT attempt auto-repair. Repair requires
 * context ("was the recording really supposed to exist?") that the
 * detector can't infer safely. The cron's job is to surface the problem;
 * remediation is on-call's job, guided by a runbook.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { detectBrokenCompletedInterviews } from "@/lib/broken-completed-detector";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await detectBrokenCompletedInterviews({
      completedSinceMinutesAgo: 24 * 60, // last 24h
      graceMinutes: 5, // ignore anything finalized in the last 5 min
      limit: 500,
    });

    if (result.broken.length > 0) {
      // Fire a Sentry alert with enough context to start a runbook. We
      // intentionally attach the top 20 interviewIds and reason counts
      // but NOT full snapshots — Sentry is not a data warehouse.
      const reasonCounts: Record<string, number> = {};
      for (const b of result.broken) {
        for (const r of b.reasons) {
          reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
        }
      }

      Sentry.captureMessage(
        `${result.broken.length} broken COMPLETED interview(s) detected`,
        {
          level: "error",
          tags: {
            component: "broken_completed_detector",
            count: String(result.broken.length),
          },
          extra: {
            scanned: result.scanned,
            scannedWindow: result.scannedWindow,
            reasonCounts,
            sampleIds: result.broken.slice(0, 20).map((b) => b.interviewId),
          },
        },
      );

      logger.error(
        `[BrokenCompletedCron] Alerting: ${result.broken.length} broken interviews in window ${result.scannedWindow.fromIso} → ${result.scannedWindow.toIso}`,
        { reasonCounts },
      );
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      scanned: result.scanned,
      brokenCount: result.broken.length,
      scannedWindow: result.scannedWindow,
      // Only echo the first 50 ids in the HTTP response — the rest go to
      // Sentry/logs. This keeps the response bounded.
      sampleBroken: result.broken.slice(0, 50).map((b) => ({
        interviewId: b.interviewId,
        reasons: b.reasons,
      })),
    });
  } catch (error) {
    logger.error("[BrokenCompletedCron] Scan failed", { error });
    Sentry.captureException(error, {
      tags: { component: "broken_completed_detector_cron" },
    });
    return NextResponse.json(
      { error: "Detection cron failed" },
      { status: 500 },
    );
  }
}

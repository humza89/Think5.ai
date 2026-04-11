/**
 * Recording Health Backfill Cron — Track 4 Task 15.
 *
 * Runs hourly (configured via vercel.json). Scans legacy interviews
 * with recordingHealth='NONE' and a non-null recordingUrl, and writes
 * the correct health value via classifyLegacyHealth.
 *
 * Idempotent — once every legacy row has been classified, subsequent
 * runs scan zero rows and return immediately. Safe to run indefinitely.
 *
 * Authentication: standard CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { runRecordingHealthBackfill } from "@/lib/recording-health-backfill";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await runRecordingHealthBackfill({
      dryRun: false,
      limit: 500,
    });

    // Alert on persistent classification failures or an unexpected
    // surge of DEGRADED/FAILED rows — either is a signal that something
    // in the recording pipeline is producing untrustworthy data.
    if (report.errors.length > 0 || report.failed > 50 || report.degraded > 200) {
      Sentry.captureMessage(
        `Recording health backfill anomaly: failed=${report.failed} degraded=${report.degraded} errors=${report.errors.length}`,
        {
          level: "warning",
          tags: { component: "recording_health_backfill" },
          extra: {
            scanned: report.scanned,
            healthy: report.healthy,
            degraded: report.degraded,
            missing: report.missing,
            failed: report.failed,
            errors: report.errors.slice(0, 20),
          },
        },
      );
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...report,
    });
  } catch (error) {
    logger.error("[RecordingHealthBackfillCron] Scan failed", { error });
    Sentry.captureException(error, { tags: { component: "recording_health_backfill_cron" } });
    return NextResponse.json({ error: "Backfill cron failed" }, { status: 500 });
  }
}

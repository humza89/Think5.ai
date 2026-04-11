/**
 * Finalization Reconciler Cron — Track 2, Task 10.
 *
 * Runs every 5 minutes (configured via vercel.json). Scans for
 * interviews that are stuck in FINALIZING state and attempts safe
 * repair using the FinalizationManifest to decide what to do. See
 * lib/finalization-reconciler.ts for the repair rules.
 *
 * Authentication: same CRON_SECRET bearer token as the other cron
 * endpoints. No user-facing access.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { reconcileStuckFinalizations } from "@/lib/finalization-reconciler";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await reconcileStuckFinalizations({ dryRun: false, limit: 100 });

    // Alert on any terminal failures or errors — those are rare and
    // deserve on-call eyes. A steady trickle of forcedComplete is
    // normal and not alert-worthy.
    if (report.terminallyFailed > 0 || report.errors.length > 0) {
      Sentry.captureMessage(
        `Finalization reconciler terminal actions: failed=${report.terminallyFailed} errors=${report.errors.length}`,
        {
          level: report.terminallyFailed > 0 ? "error" : "warning",
          tags: { component: "finalization_reconciler" },
          extra: {
            scanned: report.scanned,
            forcedComplete: report.forcedComplete,
            reportRetriggered: report.reportRetriggered,
            mergeRetriggered: report.mergeRetriggered,
            terminallyFailed: report.terminallyFailed,
            stillStuck: report.stillStuck,
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
    logger.error("[FinalizationReconcilerCron] Scan failed", { error });
    Sentry.captureException(error, { tags: { component: "finalization_reconciler_cron" } });
    return NextResponse.json({ error: "Reconciler cron failed" }, { status: 500 });
  }
}

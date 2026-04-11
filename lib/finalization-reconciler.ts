/**
 * Finalization Reconciler — Track 2, Task 10.
 *
 * The broken-completed detector from Track 1 Task 6 surfaces problems.
 * This module attempts SAFE repairs on them, driven by the
 * FinalizationManifest. The cron endpoint (app/api/cron/
 * finalization-reconciler) calls reconcileStuckFinalizations() every
 * 5 minutes.
 *
 * Safe repair actions:
 *
 *   A. Interview.status = FINALIZING for more than 15 minutes, but the
 *      manifest shows all stages satisfied → force transition to
 *      COMPLETED. The finalization work already succeeded, the state
 *      transition was just lost (process crash, deploy, etc.).
 *
 *   B. manifest.reportStatus = 'not_started' → re-fire the
 *      'interview/completed' Inngest event. This happens when the
 *      original dispatch failed after the interview transitioned but
 *      before the report cron noticed.
 *
 *   C. manifest.recordingStatus = 'finalizing' for > 10 minutes →
 *      re-trigger the merge-retry inngest function. The old merge
 *      probably crashed mid-way.
 *
 *   D. Interview.status = FINALIZING for > 60 minutes with no progress
 *      → mark the manifest FAILED and transition the interview to
 *      CANCELLED. This is the terminal failure path — the
 *      reconciliation has exhausted safe repairs.
 *
 * Unsafe actions are explicitly NOT taken:
 *
 *   - We never flip recordingStatus from 'failed' to 'merged' without
 *     actual evidence of a merged file.
 *   - We never flip ledgerStatus. The canonical ledger is the source
 *     of truth for that and only the voice/route.ts finalization path
 *     can write it.
 *   - We never reset attemptCount. The count is the audit trail for
 *     how many times a given interview has thrashed through finalization.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  evaluateManifestRecord,
  getManifest,
  markFailed,
  markSatisfied,
  type ManifestRecord,
} from "@/lib/finalization-manifest";

export interface ReconcilerReport {
  scanned: number;
  forcedComplete: number;
  reportRetriggered: number;
  mergeRetriggered: number;
  terminallyFailed: number;
  stillStuck: number;
  errors: Array<{ interviewId: string; step: string; message: string }>;
}

// Age thresholds in minutes.
const FORCE_COMPLETE_AFTER_MIN = 15;
const RECORDING_MERGE_RETRY_AFTER_MIN = 10;
const TERMINAL_FAIL_AFTER_MIN = 60;

export async function reconcileStuckFinalizations(
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<ReconcilerReport> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit ?? 100;
  const report: ReconcilerReport = {
    scanned: 0,
    forcedComplete: 0,
    reportRetriggered: 0,
    mergeRetriggered: 0,
    terminallyFailed: 0,
    stillStuck: 0,
    errors: [],
  };

  // Fetch all interviews in FINALIZING state that have been stuck for
  // more than FORCE_COMPLETE_AFTER_MIN. A shorter dwell time is either
  // normal finalization or a grace window and should not be reconciled.
  const cutoff = new Date(Date.now() - FORCE_COMPLETE_AFTER_MIN * 60_000);
  const stuck = await prisma.interview.findMany({
    where: {
      status: "FINALIZING",
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      updatedAt: true,
      recordingState: true,
      recordingUrl: true,
    },
    take: limit,
    orderBy: { updatedAt: "asc" }, // oldest first
  });
  report.scanned = stuck.length;

  for (const iv of stuck) {
    try {
      const manifest = await getManifest(iv.id);
      if (!manifest) {
        // No manifest at all — the interview was set to FINALIZING
        // without one. This is a protocol violation from the caller.
        // We surface it as still-stuck and log; we don't auto-repair
        // because we don't know what state the durability pipelines
        // were in.
        logger.error(
          `[Reconciler] interview ${iv.id} is FINALIZING but has no manifest — needs manual inspection`,
        );
        report.stillStuck += 1;
        continue;
      }

      const evaluation = evaluateManifestRecord(manifest);
      const ageMs = Date.now() - manifest.startedAt.getTime();
      const ageMin = Math.floor(ageMs / 60_000);

      // Case A: manifest already satisfied — just push the status forward.
      if (evaluation.canComplete) {
        if (!dryRun) {
          await forceCompleteInterview(iv.id, manifest, evaluation.degraded);
        }
        report.forcedComplete += 1;
        continue;
      }

      // Case D: terminal failure — interview has been stuck too long.
      // This runs BEFORE the re-trigger cases so we don't infinite-loop
      // on something that keeps failing.
      if (ageMin >= TERMINAL_FAIL_AFTER_MIN) {
        if (!dryRun) {
          await terminalFail(iv.id, evaluation.missing);
        }
        report.terminallyFailed += 1;
        continue;
      }

      // Case B: report dispatch missing — re-fire the Inngest event.
      if (manifest.reportStatus === "not_started") {
        if (!dryRun) {
          await retriggerReportDispatch(iv.id);
        }
        report.reportRetriggered += 1;
        // Intentionally keep going — we may need Case C too.
      }

      // Case C: merge stuck — re-trigger merge retry.
      if (
        manifest.recordingStatus === "finalizing" &&
        ageMin >= RECORDING_MERGE_RETRY_AFTER_MIN
      ) {
        if (!dryRun) {
          await retriggerRecordingMerge(iv.id);
        }
        report.mergeRetriggered += 1;
      }

      // If nothing matched a repair path, record as still-stuck.
      if (
        manifest.reportStatus !== "not_started" &&
        !(manifest.recordingStatus === "finalizing" && ageMin >= RECORDING_MERGE_RETRY_AFTER_MIN)
      ) {
        report.stillStuck += 1;
      }
    } catch (err) {
      report.errors.push({
        interviewId: iv.id,
        step: "reconcile",
        message: (err as Error)?.message ?? "unknown",
      });
      logger.error(`[Reconciler] error reconciling interview ${iv.id}`, { error: err });
    }
  }

  logger.info(`[Reconciler] scan complete`, { report });
  return report;
}

// ── Repair actions ────────────────────────────────────────────────────

async function forceCompleteInterview(
  interviewId: string,
  manifest: ManifestRecord,
  degraded: boolean,
): Promise<void> {
  // Transition Interview.status FINALIZING → COMPLETED.
  // The state machine allows this transition; the gate we're enforcing
  // is that the manifest is satisfied BEFORE we call update.
  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: "COMPLETED",
      completedAt: manifest.satisfiedAt ?? new Date(),
    },
  });

  if (!degraded) {
    await markSatisfied(interviewId, "reconciled_forced_complete");
  }
  // degraded is already recorded on the manifest — nothing else to do.

  logger.info(`[Reconciler] force-completed interview ${interviewId} (degraded=${degraded})`);
}

async function terminalFail(interviewId: string, missing: string[]): Promise<void> {
  // Transition Interview.status FINALIZING → CANCELLED. The state
  // machine allows this transition explicitly for catastrophic
  // finalization failures.
  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: "CANCELLED" },
  });
  await markFailed(interviewId, `reconciler_terminal_fail: ${missing.join(",")}`);
  logger.error(
    `[Reconciler] terminal fail interview ${interviewId} missing=${missing.join(",")}`,
  );
}

async function retriggerReportDispatch(interviewId: string): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "interview/completed",
      data: { interviewId, reason: "reconciler_retrigger" },
    });
    logger.info(`[Reconciler] re-triggered report dispatch for interview ${interviewId}`);
  } catch (err) {
    logger.error(`[Reconciler] Inngest re-trigger failed for interview ${interviewId}`, { error: err });
    throw err;
  }
}

async function retriggerRecordingMerge(interviewId: string): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "interview/recording.finalize.retry",
      data: { interviewId, reason: "reconciler_retrigger" },
    });
    logger.info(`[Reconciler] re-triggered recording merge for interview ${interviewId}`);
  } catch (err) {
    logger.error(`[Reconciler] Recording merge re-trigger failed for interview ${interviewId}`, { error: err });
    throw err;
  }
}

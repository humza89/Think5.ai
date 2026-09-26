/**
 * Broken-COMPLETED interview detector.
 *
 * Finds interviews that reached status=COMPLETED but violate one or more of
 * the durability invariants a completed interview must satisfy. Nothing else
 * in the system is responsible for noticing a half-finalised interview, so
 * one can sit in COMPLETED forever with no report or no playable recording.
 *
 * Salvaged from legacy PR #4 (Track 1, Task 6) and scheduled as an Inngest
 * cron (inngest/functions/broken-completed-detector.ts) rather than a Vercel
 * cron, per the Phase 0 durable-jobs decision (T7). It also stands in for the
 * FinalizationManifest state machine proposed in legacy PR #5, which is
 * deferred to Phase 1.
 *
 * Invariants:
 *   A. reportStatus is "completed"           — or terminally failed (>= 5 retries)
 *   B. recordingState is COMPLETE/VERIFIED   — when a recordingUrl exists
 *   C. Interview.transcript is non-empty     — denormalised copy for recruiters
 *   D. every InterviewTranscript ledger turn is finalized (checked only for
 *      rows that already failed A–C, to keep the scan cheap)
 *
 * Pure detection: it reports, it does not mutate. Repair stays with the
 * existing retry jobs (report-generate retries, recording-finalize-retry).
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type BreakageReason =
  | "missing_report"
  | "report_stuck_generating"
  | "report_failed_not_terminal"
  | "recording_not_complete"
  | "transcript_json_missing"
  | "transcript_ledger_not_finalized";

export interface BrokenInterview {
  interviewId: string;
  completedAt: Date | null;
  reasons: BreakageReason[];
  /** Minimal snapshot of the problematic fields for debugging. */
  snapshot: {
    reportStatus: string | null;
    reportRetryCount: number | null;
    recordingState: string | null;
    recordingUrl: string | null;
    transcriptPresent: boolean;
    nonFinalizedTurnCount: number;
  };
}

export interface DetectionResult {
  scanned: number;
  broken: BrokenInterview[];
  reasonBreakdown: Record<string, number>;
  scannedWindow: { fromIso: string; toIso: string };
}

/**
 * Window policy: look back 24 h (older rows may already be retention-cleaned
 * and would be false positives) and give finalisation 5 minutes of grace.
 */
export const DEFAULT_DETECTION_WINDOW = {
  completedSinceMinutesAgo: 24 * 60,
  graceMinutes: 5,
} as const;

/** A report may legitimately sit in "generating" for this long. */
const GENERATING_TOLERANCE_MS = 10 * 60_000;
/** Matches the retry cap in lib/report-generator. */
const TERMINAL_REPORT_RETRIES = 5;

export async function detectBrokenCompletedInterviews(
  opts: {
    completedSinceMinutesAgo?: number;
    graceMinutes?: number;
    limit?: number;
  } = {},
): Promise<DetectionResult> {
  const completedSinceMinutesAgo =
    opts.completedSinceMinutesAgo ?? DEFAULT_DETECTION_WINDOW.completedSinceMinutesAgo;
  const graceMinutes = opts.graceMinutes ?? DEFAULT_DETECTION_WINDOW.graceMinutes;
  const limit = opts.limit ?? 500;

  const now = Date.now();
  const from = new Date(now - completedSinceMinutesAgo * 60 * 1000);
  const to = new Date(now - graceMinutes * 60 * 1000);

  const candidates = await prisma.interview.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      completedAt: true,
      reportStatus: true,
      reportRetryCount: true,
      recordingState: true,
      recordingUrl: true,
      transcript: true,
    },
    take: limit,
    orderBy: { completedAt: "desc" },
  });

  const broken: BrokenInterview[] = [];

  for (const iv of candidates) {
    const reasons: BreakageReason[] = [];

    // Invariant A: the report must be durable.
    const rs = iv.reportStatus;
    if (rs === null || rs === undefined || rs === "pending") {
      reasons.push("missing_report");
    } else if (rs === "generating") {
      if (iv.completedAt && now - iv.completedAt.getTime() > GENERATING_TOLERANCE_MS) {
        reasons.push("report_stuck_generating");
      }
    } else if (rs === "failed") {
      if ((iv.reportRetryCount ?? 0) < TERMINAL_REPORT_RETRIES) {
        reasons.push("report_failed_not_terminal");
      }
      // Terminal failure is a real outcome, not breakage.
    }

    // Invariant B: recording state must match URL presence.
    if (iv.recordingUrl !== null) {
      if (iv.recordingState !== "COMPLETE" && iv.recordingState !== "VERIFIED") {
        reasons.push("recording_not_complete");
      }
    }

    // Invariant C: denormalised transcript JSON exists on the Interview row.
    const transcriptPresent =
      iv.transcript !== null &&
      iv.transcript !== undefined &&
      !(Array.isArray(iv.transcript) && iv.transcript.length === 0);
    if (!transcriptPresent) {
      reasons.push("transcript_json_missing");
    }

    // Invariant D: ledger fully finalised (only for rows already suspect).
    let nonFinalizedTurnCount = 0;
    if (reasons.length > 0) {
      nonFinalizedTurnCount = await prisma.interviewTranscript.count({
        where: { interviewId: iv.id, finalized: false },
      });
      if (nonFinalizedTurnCount > 0) {
        reasons.push("transcript_ledger_not_finalized");
      }
    }

    if (reasons.length > 0) {
      broken.push({
        interviewId: iv.id,
        completedAt: iv.completedAt,
        reasons,
        snapshot: {
          reportStatus: iv.reportStatus ?? null,
          reportRetryCount: iv.reportRetryCount ?? null,
          recordingState: iv.recordingState ?? null,
          recordingUrl: iv.recordingUrl ?? null,
          transcriptPresent,
          nonFinalizedTurnCount,
        },
      });
    }
  }

  const result: DetectionResult = {
    scanned: candidates.length,
    broken,
    reasonBreakdown: countReasons(broken),
    scannedWindow: { fromIso: from.toISOString(), toIso: to.toISOString() },
  };

  if (broken.length > 0) {
    logger.error(
      `[BrokenCompleted] Found ${broken.length} broken COMPLETED interview(s) in the last ${completedSinceMinutesAgo} min`,
      { count: broken.length, scanned: candidates.length, reasonBreakdown: result.reasonBreakdown },
    );
  } else {
    logger.info(`[BrokenCompleted] Clean scan — 0 broken COMPLETED interviews (scanned ${candidates.length})`);
  }

  return result;
}

function countReasons(broken: BrokenInterview[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of broken) {
    for (const r of b.reasons) {
      counts[r] = (counts[r] ?? 0) + 1;
    }
  }
  return counts;
}

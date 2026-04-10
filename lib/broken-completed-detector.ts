/**
 * Broken-Completed Interview Detector — Track 1, Task 6.
 *
 * Detects interviews that reached status=COMPLETED but failed one or more
 * of the durability invariants we expect a completed interview to satisfy.
 * This is the "reconciliation" layer the audit explicitly asked for: today,
 * a half-finalized interview can sit in COMPLETED forever because no
 * component is responsible for noticing.
 *
 * Invariants a COMPLETED interview must satisfy:
 *
 *   A. Report status is "completed"           — report exists and is durable
 *   B. Recording state is COMPLETE or VERIFIED — or the interview genuinely
 *                                                 had no recording (recordingUrl
 *                                                 was null from the start)
 *   C. Transcript JSON is non-null            — denormalized copy exists
 *                                                 for recruiter consumption
 *   D. At least one non-finalized turn in the InterviewTranscript ledger is
 *      a hard red flag — finalization should have flipped them all to true
 *
 * This module exports the pure detection logic so it can be reused by:
 *   - the Vercel cron (app/api/cron/broken-completed-detector)
 *   - the admin reliability dashboard
 *   - an on-demand ops runbook script
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Categorized breakage reasons. Each detected interview may have 1..N.
 */
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
  scannedWindow: { fromIso: string; toIso: string };
}

/**
 * Time window policy:
 *   - fromMinutesAgo: don't look too far back; retention may have
 *     already cleaned these up and we'd produce false positives
 *   - completedSinceMinutesAgo: give finalization a few minutes of grace
 *     so we don't alert on interviews that JUST completed and are
 *     legitimately still in the last steps of post-processing
 */
export const DEFAULT_DETECTION_WINDOW = {
  completedSinceMinutesAgo: 24 * 60, // last 24h
  graceMinutes: 5, // ignore anything completed in the last 5 minutes
} as const;

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

  // Fetch candidates for inspection. We only look at COMPLETED rows within
  // the window; anything that left COMPLETED (unlikely) is out of scope.
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

    // Invariant A: report must be durable.
    // Accept: reportStatus="completed"
    // Warn:   reportStatus="failed" with retries remaining — the retry cron
    //         will eventually exhaust, but right now we consider it broken.
    // Fail:   reportStatus null, pending, or generating
    const rs = iv.reportStatus;
    if (rs === null || rs === undefined || rs === "pending") {
      reasons.push("missing_report");
    } else if (rs === "generating") {
      // Only flag if completedAt is more than 10 minutes old — a normal
      // generating window. The report-retry cron resets "stuck" after 10
      // minutes so this is the same threshold.
      if (iv.completedAt && now - iv.completedAt.getTime() > 10 * 60_000) {
        reasons.push("report_stuck_generating");
      }
    } else if (rs === "failed") {
      const retries = iv.reportRetryCount ?? 0;
      if (retries < 5) {
        reasons.push("report_failed_not_terminal");
      }
      // If retries >= 5, the report is terminally failed and that is a
      // real outcome — we don't flag it as broken here. A separate
      // "terminally failed reports" dashboard handles those.
    }

    // Invariant B: recording state must match URL presence.
    // If recordingUrl was set at some point, we expect recordingState to
    // be COMPLETE or VERIFIED. If recordingUrl is null and recordingState
    // is null, the interview legitimately had no recording — fine.
    if (iv.recordingUrl !== null) {
      const rstate = iv.recordingState;
      if (rstate !== "COMPLETE" && rstate !== "VERIFIED") {
        reasons.push("recording_not_complete");
      }
    }

    // Invariant C: denormalized transcript JSON exists on Interview row.
    const transcriptPresent =
      iv.transcript !== null &&
      iv.transcript !== undefined &&
      !(Array.isArray(iv.transcript) && iv.transcript.length === 0);
    if (!transcriptPresent) {
      reasons.push("transcript_json_missing");
    }

    // Invariant D: ledger must be fully finalized.
    // We only run this check for interviews that are otherwise candidate-
    // broken, to keep the scan cheap. For clean interviews we skip.
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
    scannedWindow: { fromIso: from.toISOString(), toIso: to.toISOString() },
  };

  if (broken.length > 0) {
    logger.error(
      `[BrokenCompleted] Found ${broken.length} broken COMPLETED interview(s) in the last ${completedSinceMinutesAgo}min`,
      {
        count: broken.length,
        scanned: candidates.length,
        reasonBreakdown: countReasons(broken),
      },
    );
  } else {
    logger.info(
      `[BrokenCompleted] Clean scan — 0 broken COMPLETED interviews (scanned ${candidates.length})`,
    );
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

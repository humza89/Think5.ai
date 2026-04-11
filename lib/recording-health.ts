/**
 * Recording Health — Track 4 Task 15.
 *
 * Owns the durable "is this recording trustworthy for recruiter
 * playback?" field on the Interview row. See the RecordingHealth enum
 * in prisma/schema.prisma for the full value-set and semantics.
 *
 * Why this module exists:
 *   - recordingState describes the PIPELINE (UPLOADING / FINALIZING /
 *     COMPLETE / VERIFIED / DELETED). It answers "where is the
 *     recording in its processing lifecycle".
 *   - recordingHealth describes the INTEGRITY (HEALTHY / DEGRADED /
 *     MISSING / FAILED). It answers "is this recording actually safe
 *     to show a recruiter".
 *   - Before Track 4, the codebase conflated the two. Track 1 Task 2
 *     killed the silent first-chunk fallback in media-storage.ts;
 *     this module is the second half of that fix — a persistent,
 *     queryable, indexable record of whether each recording was ever
 *     trustworthy, without depending on R2 being reachable at read
 *     time.
 *   - Complementary to the FinalizationManifest from Track 2: the
 *     manifest tracks recordingStatus DURING finalization; this field
 *     is the DURABLE POST-FINALIZATION answer.
 *
 * The recruiter playback UI (and the /playback-ready preflight from
 * Track 2 Task 11) MUST gate on recordingHealth='HEALTHY'. Any other
 * value means "show unavailable / contact support".
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Mirror the Prisma enum without importing it as a runtime value —
// keeps this module importable in test environments where the Prisma
// client isn't fully initialized.
export type RecordingHealth =
  | "NONE"
  | "PROCESSING"
  | "HEALTHY"
  | "DEGRADED"
  | "MISSING"
  | "FAILED";

/**
 * Health values that are safe to show to a recruiter. Only HEALTHY
 * qualifies — DEGRADED is deliberately NOT in this set, because the
 * entire point of the Track 4 model is to refuse to show a recruiter
 * a compromised recording as if it were trustworthy.
 */
const PLAYABLE: ReadonlySet<RecordingHealth> = new Set(["HEALTHY"]);

/**
 * Health values that are terminal — they will never transition to
 * HEALTHY without human intervention (or a successful re-upload). The
 * playback UI may suggest re-upload flows for these states.
 */
const TERMINAL: ReadonlySet<RecordingHealth> = new Set([
  "DEGRADED",
  "MISSING",
  "FAILED",
]);

export function isPlayable(health: RecordingHealth): boolean {
  return PLAYABLE.has(health);
}

export function isTerminal(health: RecordingHealth): boolean {
  return TERMINAL.has(health);
}

/**
 * Map a media-storage finalization outcome to a health value. Called
 * by app/api/interviews/[id]/recording/route.ts at the end of the
 * finalize action.
 *
 * mergeSucceeded=true + playable URL resolved  → HEALTHY
 * mergeSucceeded=true + URL null                → MISSING
 * mergeSucceeded=false                          → DEGRADED (or FAILED if
 *                                                  no chunks at all)
 */
export function healthFromMergeOutcome(args: {
  mergeSucceeded: boolean;
  playbackUrlResolved: boolean;
  totalChunks: number;
}): { health: RecordingHealth; reason: string } {
  if (args.mergeSucceeded && args.playbackUrlResolved) {
    return { health: "HEALTHY", reason: "merge_succeeded_url_resolved" };
  }
  if (args.mergeSucceeded && !args.playbackUrlResolved) {
    return { health: "MISSING", reason: "merge_succeeded_but_url_missing" };
  }
  if (!args.mergeSucceeded && args.totalChunks === 0) {
    return { health: "FAILED", reason: "no_chunks_captured" };
  }
  // Merge failed but chunks exist — degraded, not failed. The reconciler
  // can retry the merge; if it eventually succeeds, the health flips to
  // HEALTHY via a subsequent setRecordingHealth call.
  return { health: "DEGRADED", reason: "merge_failed_chunks_exist" };
}

/**
 * Write the health value to the Interview row. Idempotent — writing
 * the same value twice is a no-op on user-visible state but refreshes
 * recordingHealthAt so the admin dashboard sees the latest check.
 *
 * This is the ONLY code path that should mutate Interview.recordingHealth.
 * Other callers MUST go through this function so the reason and
 * timestamp are kept in sync.
 */
export async function setRecordingHealth(
  interviewId: string,
  health: RecordingHealth,
  reason: string,
): Promise<void> {
  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      recordingHealth: health,
      recordingHealthReason: reason,
      recordingHealthAt: new Date(),
    },
  });
  logger.info(
    `[RecordingHealth] interviewId=${interviewId} health=${health} reason=${reason}`,
  );
}

/**
 * Read the current health for an interview. Returns null if the
 * interview doesn't exist. Used by the playback-ready preflight and
 * the recruiter UI.
 */
export async function getRecordingHealth(
  interviewId: string,
): Promise<{
  health: RecordingHealth;
  reason: string | null;
  at: Date | null;
} | null> {
  const row = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      recordingHealth: true,
      recordingHealthReason: true,
      recordingHealthAt: true,
    },
  });
  if (!row) return null;
  return {
    health: row.recordingHealth as RecordingHealth,
    reason: row.recordingHealthReason,
    at: row.recordingHealthAt,
  };
}

/**
 * Pure classifier used by the legacy backfill cron to guess the
 * correct health value for an interview that was finalized before
 * Track 4 shipped. We infer from the three columns the old code did
 * write:
 *   - recordingUrl
 *   - recordingState
 *   - recordingSize
 *
 * Inference rules (conservative — when in doubt we pick DEGRADED
 * rather than HEALTHY, because the whole point of this sweep is to
 * stop recruiters from trusting recordings we can't verify):
 *
 *   recordingUrl=null             → NONE
 *   recordingState=UPLOADING      → PROCESSING
 *   recordingState=FINALIZING     → PROCESSING
 *   recordingState=DELETED        → MISSING
 *   recordingState=COMPLETE/VERIFIED with recordingSize > 0 and a URL
 *                                 → DEGRADED (we can't verify the merge
 *                                   actually succeeded — the old code
 *                                   was happy to mark COMPLETE even on
 *                                   a silent first-chunk fallback, so
 *                                   legacy 'COMPLETE' is untrustworthy
 *                                   by construction)
 *   everything else               → FAILED
 *
 * After the backfill cron runs once, operators can MANUALLY re-verify
 * any row marked DEGRADED by re-running the merge and, if successful,
 * letting setRecordingHealth promote it to HEALTHY. This refuses to
 * silently whitewash legacy data.
 */
export function classifyLegacyHealth(row: {
  recordingUrl: string | null;
  recordingState: string | null;
  recordingSize: number | null;
}): { health: RecordingHealth; reason: string } {
  if (!row.recordingUrl) {
    return { health: "NONE", reason: "legacy:no_recording_url" };
  }
  const state = row.recordingState;
  if (state === "UPLOADING" || state === "FINALIZING") {
    return { health: "PROCESSING", reason: `legacy:state=${state}` };
  }
  if (state === "DELETED") {
    return { health: "MISSING", reason: "legacy:state=DELETED" };
  }
  if (
    (state === "COMPLETE" || state === "VERIFIED") &&
    row.recordingSize !== null &&
    row.recordingSize > 0
  ) {
    return {
      health: "DEGRADED",
      reason: "legacy:state=COMPLETE_unverified_merge",
    };
  }
  return {
    health: "FAILED",
    reason: `legacy:state=${state ?? "null"}_size=${row.recordingSize ?? "null"}`,
  };
}

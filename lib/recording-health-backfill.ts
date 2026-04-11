/**
 * Recording Health Backfill — Track 4 Task 15.
 *
 * After the Track 4 migration adds the recordingHealth column with
 * default NONE, every existing interview starts in 'NONE' — including
 * old ones that have recordingUrl set and are actually watchable. This
 * module scans those legacy rows and classifies them with
 * classifyLegacyHealth() so the recruiter UI has an accurate answer.
 *
 * The conservative rule is that legacy recordings with state=COMPLETE
 * are marked DEGRADED (not HEALTHY). That's because the pre-Track-1
 * media-storage.ts silently fell back to serving the first 10MB chunk
 * when merge failed — it wrote state=COMPLETE while actually producing
 * partial content. We can't distinguish legacy-actually-healthy from
 * legacy-silent-fallback without re-verifying the merged file; DEGRADED
 * is the safe answer. Operators can re-verify and promote to HEALTHY
 * manually via the admin dashboard.
 *
 * The backfill is IDEMPOTENT: only rows with recordingHealth='NONE'
 * and a non-null recordingUrl are touched. Running the cron twice is
 * a no-op on the second run.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  classifyLegacyHealth,
  setRecordingHealth,
  type RecordingHealth,
} from "@/lib/recording-health";

export interface BackfillReport {
  scanned: number;
  healthy: number;
  degraded: number;
  missing: number;
  failed: number;
  processing: number;
  errors: Array<{ interviewId: string; message: string }>;
}

export async function runRecordingHealthBackfill(
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<BackfillReport> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit ?? 500;

  const report: BackfillReport = {
    scanned: 0,
    healthy: 0,
    degraded: 0,
    missing: 0,
    failed: 0,
    processing: 0,
    errors: [],
  };

  // Only touch rows with health=NONE and a recordingUrl. Rows that
  // legitimately have no recording (text interviews) stay at NONE.
  const candidates = await prisma.interview.findMany({
    where: {
      recordingHealth: "NONE",
      recordingUrl: { not: null },
    },
    select: {
      id: true,
      recordingUrl: true,
      recordingState: true,
      recordingSize: true,
    },
    take: limit,
    // Oldest first — stale legacy data gets processed before fresh
    // in-flight uploads that happen to hit this cron between chunks.
    orderBy: { createdAt: "asc" },
  });
  report.scanned = candidates.length;

  for (const row of candidates) {
    try {
      const classified = classifyLegacyHealth(row);
      bump(report, classified.health);

      if (!dryRun) {
        await setRecordingHealth(row.id, classified.health, classified.reason);
      }
    } catch (err) {
      report.errors.push({
        interviewId: row.id,
        message: (err as Error)?.message ?? "unknown",
      });
      logger.error(`[RecordingHealthBackfill] classify failed for ${row.id}`, { error: err });
    }
  }

  logger.info(`[RecordingHealthBackfill] complete`, { report });
  return report;
}

function bump(report: BackfillReport, health: RecordingHealth): void {
  switch (health) {
    case "HEALTHY":
      report.healthy += 1;
      break;
    case "DEGRADED":
      report.degraded += 1;
      break;
    case "MISSING":
      report.missing += 1;
      break;
    case "FAILED":
      report.failed += 1;
      break;
    case "PROCESSING":
      report.processing += 1;
      break;
    case "NONE":
      // Shouldn't happen — we only selected rows with recordingUrl set,
      // and classifyLegacyHealth only returns NONE when recordingUrl is
      // null. Treat as an error rather than silently dropping.
      report.errors.push({
        interviewId: "unknown",
        message: "classifier returned NONE for a row with recordingUrl set",
      });
      break;
  }
}

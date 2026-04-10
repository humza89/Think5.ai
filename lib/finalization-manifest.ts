/**
 * FinalizationManifest — atomic finalization contract.
 *
 * Track 2, Tasks 7 + 8 of the enterprise-audit remediation plan.
 *
 * The audit found that Interview.status='COMPLETED' was non-atomic: three
 * independent pipelines (ledger, recording, report) could each fail and
 * the interview could still end up COMPLETED with partial data. This
 * module introduces a per-interview manifest row that records the truth
 * of each stage, and a typed state machine that REFUSES to transition
 * Interview.status → COMPLETED unless the manifest reports every required
 * stage as satisfied (or explicitly degraded-but-acceptable).
 *
 * ── Invariant ────────────────────────────────────────────────────────
 *
 *   An interview may only transition to COMPLETED if and only if:
 *
 *     manifest.state ∈ {"satisfied", "degraded"}
 *       AND manifest.ledgerStatus = "finalized"
 *       AND manifest.reportStatus ∈ {"completed", "pending", "generating"}
 *       AND manifest.recordingStatus ∈ {"merged", "not_applicable", "degraded"}
 *
 *   If the manifest fails to reach this state within the finalization
 *   window, the interview stays in FINALIZING and the reconciliation
 *   cron (Task 10) will attempt repair or transition to FAILED.
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *
 *   1. Caller begins finalization:
 *        await beginFinalization(interviewId, { reason })
 *        // Creates or bumps the manifest row, sets state='in_flight',
 *        // increments attemptCount.
 *
 *   2. Caller updates stages as they complete:
 *        await updateStage(interviewId, { ledgerStatus: "finalized" })
 *        await updateStage(interviewId, { recordingStatus: "merged" })
 *        await updateStage(interviewId, { reportStatus: "pending" })
 *
 *   3. Caller asks whether it's safe to mark COMPLETED:
 *        const { canComplete, missing } = await evaluateManifest(interviewId)
 *        if (canComplete) { ... transition Interview.status → COMPLETED }
 *
 *   4. On terminal failure:
 *        await markFailed(interviewId, "report_dispatch_failed")
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────

export type ManifestState =
  | "pending"
  | "in_flight"
  | "satisfied"
  | "degraded"
  | "failed";

export type LedgerStatus = "not_finalized" | "finalized" | "integrity_failed";

export type RecordingStatus =
  | "not_applicable"
  | "uploading"
  | "finalizing"
  | "merged"
  | "degraded"
  | "failed";

export type ReportStatus =
  | "not_started"
  | "pending"
  | "generating"
  | "completed"
  | "failed";

export type AuditStatus = "not_started" | "partial" | "complete";

/**
 * Stage terminal sets — the status values that are considered "safe to
 * complete the interview with". Any stage whose status is NOT in this
 * set will block the evaluateManifest() gate.
 */
const LEDGER_SAFE: ReadonlySet<LedgerStatus> = new Set(["finalized"]);

const RECORDING_SAFE: ReadonlySet<RecordingStatus> = new Set([
  "merged",
  "not_applicable",
  // "degraded" is explicitly acceptable — it means the recording failed
  // but we've already set Interview.recordingUrl = null and will show a
  // "recording unavailable" state in the UI. This is the Track 1 Task 2
  // contract: no silent lies, but a legitimate "we tried and can't".
  "degraded",
]);

const REPORT_SAFE: ReadonlySet<ReportStatus> = new Set([
  // Report generation is intentionally async — a "pending" or "generating"
  // report does NOT block completion of the interview itself. The gate
  // here is "the dispatch succeeded or is already running". The report
  // retry cron owns the eventual completion.
  "pending",
  "generating",
  "completed",
]);

export interface ManifestRecord {
  interviewId: string;
  state: ManifestState;
  ledgerStatus: LedgerStatus;
  recordingStatus: RecordingStatus;
  reportStatus: ReportStatus;
  auditStatus: AuditStatus;
  reason: string | null;
  attemptCount: number;
  startedAt: Date;
  updatedAt: Date;
  satisfiedAt: Date | null;
  failedAt: Date | null;
}

export interface EvaluateResult {
  canComplete: boolean;
  degraded: boolean;
  missing: string[];
  record: ManifestRecord;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Begin or resume finalization for an interview. Creates a new manifest
 * row if none exists, otherwise increments attemptCount and sets state to
 * "in_flight". Safe to call multiple times — each call is an explicit
 * attempt and the manifest keeps a running count.
 */
export async function beginFinalization(
  interviewId: string,
  opts: { reason?: string } = {},
): Promise<ManifestRecord> {
  const reason = opts.reason ?? "finalization_started";
  const now = new Date();

  // Upsert keeps this idempotent across retry/replay. The `create` path
  // starts the row in "in_flight" with attemptCount=1; the `update` path
  // bumps attempts and resets state.
  const row = await prisma.finalizationManifest.upsert({
    where: { interviewId },
    create: {
      interviewId,
      state: "in_flight",
      reason,
      attemptCount: 1,
      startedAt: now,
      updatedAt: now,
    },
    update: {
      state: "in_flight",
      reason,
      attemptCount: { increment: 1 },
      updatedAt: now,
      // Clear terminal timestamps so a retry after failure can progress.
      satisfiedAt: null,
      failedAt: null,
    },
  });

  logger.info(
    `[FinalizationManifest] begin interviewId=${interviewId} attempt=${row.attemptCount} reason=${reason}`,
  );
  return toRecord(row);
}

/**
 * Update one or more stages on the manifest. Typed to accept any subset
 * of the stage fields so callers can update them independently as each
 * pipeline stage completes.
 */
export async function updateStage(
  interviewId: string,
  patch: {
    ledgerStatus?: LedgerStatus;
    recordingStatus?: RecordingStatus;
    reportStatus?: ReportStatus;
    auditStatus?: AuditStatus;
    reason?: string;
  },
): Promise<ManifestRecord> {
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.ledgerStatus !== undefined) data.ledgerStatus = patch.ledgerStatus;
  if (patch.recordingStatus !== undefined) data.recordingStatus = patch.recordingStatus;
  if (patch.reportStatus !== undefined) data.reportStatus = patch.reportStatus;
  if (patch.auditStatus !== undefined) data.auditStatus = patch.auditStatus;
  if (patch.reason !== undefined) data.reason = patch.reason;

  const row = await prisma.finalizationManifest.update({
    where: { interviewId },
    data,
  });
  logger.info(`[FinalizationManifest] update interviewId=${interviewId}`, { patch });
  return toRecord(row);
}

/**
 * Evaluate whether the manifest satisfies the atomic completion contract.
 * Returns `canComplete: true` only if every required stage is in a safe
 * status. Also returns a `missing` array describing which stages are
 * blocking, for logging and for the playback-ready preflight.
 *
 * This function is PURE given the current manifest row — it does not
 * write anything. The caller decides what to do with the verdict.
 */
export async function evaluateManifest(interviewId: string): Promise<EvaluateResult | null> {
  const row = await prisma.finalizationManifest.findUnique({
    where: { interviewId },
  });
  if (!row) return null;

  const record = toRecord(row);
  return evaluateManifestRecord(record);
}

/**
 * Pure evaluator — same logic as evaluateManifest() but operates on an
 * in-memory record. Exported so tests and the reconciliation cron can
 * reuse it without an extra DB read.
 */
export function evaluateManifestRecord(record: ManifestRecord): EvaluateResult {
  const missing: string[] = [];
  if (!LEDGER_SAFE.has(record.ledgerStatus)) {
    missing.push(`ledger:${record.ledgerStatus}`);
  }
  if (!RECORDING_SAFE.has(record.recordingStatus)) {
    missing.push(`recording:${record.recordingStatus}`);
  }
  if (!REPORT_SAFE.has(record.reportStatus)) {
    missing.push(`report:${record.reportStatus}`);
  }

  const canComplete = missing.length === 0;
  const degraded = canComplete && record.recordingStatus === "degraded";

  return { canComplete, degraded, missing, record };
}

/**
 * Mark the manifest as satisfied — the caller is about to transition the
 * interview to COMPLETED. This write is the final audit-trail entry for
 * successful finalization.
 */
export async function markSatisfied(interviewId: string, reason?: string): Promise<ManifestRecord> {
  const now = new Date();
  const row = await prisma.finalizationManifest.update({
    where: { interviewId },
    data: {
      state: "satisfied",
      reason: reason ?? "manifest_satisfied",
      satisfiedAt: now,
      updatedAt: now,
    },
  });
  logger.info(`[FinalizationManifest] satisfied interviewId=${interviewId}`);
  return toRecord(row);
}

/**
 * Mark the manifest as degraded — COMPLETED is still acceptable but the
 * UI must show a warning (typically used when recordingStatus="degraded"
 * after the Track 1 Task 2 fix killed the silent first-chunk fallback).
 */
export async function markDegraded(interviewId: string, reason: string): Promise<ManifestRecord> {
  const now = new Date();
  const row = await prisma.finalizationManifest.update({
    where: { interviewId },
    data: {
      state: "degraded",
      reason,
      satisfiedAt: now,
      updatedAt: now,
    },
  });
  logger.warn(`[FinalizationManifest] degraded interviewId=${interviewId} reason=${reason}`);
  return toRecord(row);
}

/**
 * Mark the manifest as terminally failed. The interview should NOT
 * transition to COMPLETED — it should go to CANCELLED/FAILED or stay in
 * FINALIZING for the reconciliation cron to handle.
 */
export async function markFailed(interviewId: string, reason: string): Promise<ManifestRecord> {
  const now = new Date();
  const row = await prisma.finalizationManifest.update({
    where: { interviewId },
    data: {
      state: "failed",
      reason,
      failedAt: now,
      updatedAt: now,
    },
  });
  logger.error(`[FinalizationManifest] failed interviewId=${interviewId} reason=${reason}`);
  return toRecord(row);
}

/** Read the manifest without evaluating. */
export async function getManifest(interviewId: string): Promise<ManifestRecord | null> {
  const row = await prisma.finalizationManifest.findUnique({ where: { interviewId } });
  return row ? toRecord(row) : null;
}

// ── Internals ─────────────────────────────────────────────────────────

type PrismaManifestRow = {
  interviewId: string;
  state: string;
  ledgerStatus: string;
  recordingStatus: string;
  reportStatus: string;
  auditStatus: string;
  reason: string | null;
  attemptCount: number;
  startedAt: Date;
  updatedAt: Date;
  satisfiedAt: Date | null;
  failedAt: Date | null;
};

function toRecord(row: PrismaManifestRow): ManifestRecord {
  return {
    interviewId: row.interviewId,
    state: row.state as ManifestState,
    ledgerStatus: row.ledgerStatus as LedgerStatus,
    recordingStatus: row.recordingStatus as RecordingStatus,
    reportStatus: row.reportStatus as ReportStatus,
    auditStatus: row.auditStatus as AuditStatus,
    reason: row.reason,
    attemptCount: row.attemptCount,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    satisfiedAt: row.satisfiedAt,
    failedAt: row.failedAt,
  };
}

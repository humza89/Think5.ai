-- Track 2: Atomic Finalization (Tasks 7, 8, 9)
--
-- Adds the FINALIZING state, the FinalizationManifest row per Interview,
-- and the InterviewFinalizationAttempt idempotency store. After this
-- migration, Interview.status may only transition to COMPLETED from
-- FINALIZING (enforced at the application layer in lib/interview-state-machine.ts).
--
-- This migration is ADDITIVE and SAFE TO ROLL FORWARD on a live database:
--   - No existing columns are dropped or retyped.
--   - Enum value is added (not reordered).
--   - New tables have CASCADE delete so tearing them down is straightforward.
--
-- Rollback plan:
--   DROP TABLE "InterviewFinalizationAttempt";
--   DROP TABLE "FinalizationManifest";
--   -- The FINALIZING enum value cannot be removed from Postgres without
--   -- touching every row that references it. If rollback is needed,
--   -- leave the enum value in place and disable the state machine guard
--   -- in lib/interview-state-machine.ts instead.

-- 1. Add FINALIZING to the InterviewStatus enum ----------------------

ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'FINALIZING' BEFORE 'COMPLETED';

-- 2. FinalizationManifest ---------------------------------------------

CREATE TABLE "FinalizationManifest" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "ledgerStatus" TEXT NOT NULL DEFAULT 'not_finalized',
    "recordingStatus" TEXT NOT NULL DEFAULT 'not_applicable',
    "reportStatus" TEXT NOT NULL DEFAULT 'not_started',
    "auditStatus" TEXT NOT NULL DEFAULT 'not_started',
    "reason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "satisfiedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "FinalizationManifest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinalizationManifest_interviewId_key" ON "FinalizationManifest"("interviewId");
CREATE INDEX "FinalizationManifest_state_idx" ON "FinalizationManifest"("state");
CREATE INDEX "FinalizationManifest_startedAt_idx" ON "FinalizationManifest"("startedAt");
CREATE INDEX "FinalizationManifest_satisfiedAt_idx" ON "FinalizationManifest"("satisfiedAt");

ALTER TABLE "FinalizationManifest"
  ADD CONSTRAINT "FinalizationManifest_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. InterviewFinalizationAttempt (idempotency) -----------------------

CREATE TABLE "InterviewFinalizationAttempt" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "responseStatus" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewFinalizationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewFinalizationAttempt_interviewId_idempotencyKey_key"
  ON "InterviewFinalizationAttempt"("interviewId", "idempotencyKey");

CREATE INDEX "InterviewFinalizationAttempt_createdAt_idx"
  ON "InterviewFinalizationAttempt"("createdAt");

ALTER TABLE "InterviewFinalizationAttempt"
  ADD CONSTRAINT "InterviewFinalizationAttempt_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

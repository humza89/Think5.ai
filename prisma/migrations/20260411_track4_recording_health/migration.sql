-- Track 4 Task 15: Recording Health Model
--
-- Adds the RecordingHealth enum, three new Interview columns
-- (recordingHealth, recordingHealthReason, recordingHealthAt), and an
-- index to support the backfill cron's query pattern. This is ADDITIVE
-- and safe to roll forward on a live database — no existing columns are
-- dropped or retyped.
--
-- Default value for existing rows: NONE. The application layer is
-- responsible for transitioning HEALTHY/DEGRADED/etc. as the pipeline
-- runs. A follow-up backfill cron (app/api/cron/recording-health-backfill)
-- inspects old rows with recordingUrl IS NOT NULL and writes the correct
-- value based on the known pipeline state.
--
-- Rollback plan:
--   ALTER TABLE "Interview" DROP COLUMN "recordingHealthAt";
--   ALTER TABLE "Interview" DROP COLUMN "recordingHealthReason";
--   ALTER TABLE "Interview" DROP COLUMN "recordingHealth";
--   DROP TYPE "RecordingHealth";
--   -- The index is dropped automatically with the column.

-- 1. Enum ------------------------------------------------------------

CREATE TYPE "RecordingHealth" AS ENUM (
  'NONE',
  'PROCESSING',
  'HEALTHY',
  'DEGRADED',
  'MISSING',
  'FAILED'
);

-- 2. Interview columns -----------------------------------------------

ALTER TABLE "Interview"
  ADD COLUMN "recordingHealth" "RecordingHealth" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "recordingHealthReason" TEXT,
  ADD COLUMN "recordingHealthAt" TIMESTAMP(3);

-- 3. Index ------------------------------------------------------------

CREATE INDEX "Interview_recordingHealth_idx" ON "Interview"("recordingHealth");

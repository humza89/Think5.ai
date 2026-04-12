-- Track 6 Task 24: Soft-delete columns + indexes
--
-- The Prisma middleware in lib/prisma.ts (lines 55–88) adds
-- WHERE deletedAt IS NULL to every read query on Candidate, Interview,
-- and InterviewReport, and converts delete operations to
-- SET deletedAt = NOW(). But the deletedAt column did NOT exist in the
-- schema — the middleware was referencing a non-existent field.
--
-- This migration adds the column and a B-tree index to each table.
-- Uses ADD COLUMN IF NOT EXISTS so the migration is SAFE regardless of
-- whether the columns already exist in production (schema-drift
-- scenario where they were added via raw SQL but not tracked in the
-- Prisma schema).
--
-- The index enables the WHERE deletedAt IS NULL filter to use an index
-- scan instead of a full-table scan on every read query. Without the
-- index, every findMany/findFirst/count/aggregate on these three
-- high-traffic tables was doing a seq scan.
--
-- Rollback:
--   DROP INDEX IF EXISTS "Candidate_deletedAt_idx";
--   DROP INDEX IF EXISTS "Interview_deletedAt_idx";
--   DROP INDEX IF EXISTS "InterviewReport_deletedAt_idx";
--   ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "deletedAt";
--   ALTER TABLE "Interview" DROP COLUMN IF EXISTS "deletedAt";
--   ALTER TABLE "InterviewReport" DROP COLUMN IF EXISTS "deletedAt";

-- 1. Add deletedAt columns -----------------------------------------------

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- 2. Add indexes ----------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Candidate_deletedAt_idx" ON "Candidate"("deletedAt");
CREATE INDEX IF NOT EXISTS "Interview_deletedAt_idx" ON "Interview"("deletedAt");
CREATE INDEX IF NOT EXISTS "InterviewReport_deletedAt_idx" ON "InterviewReport"("deletedAt");

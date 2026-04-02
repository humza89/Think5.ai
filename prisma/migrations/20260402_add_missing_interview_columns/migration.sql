-- Add missing Interview columns (knowledgeGraph, pause tracking)
-- These columns exist in the Prisma schema but were not included in prior migrations.
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "knowledgeGraph" JSONB;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "knowledgeGraphUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "totalPauseDurationMs" INTEGER NOT NULL DEFAULT 0;

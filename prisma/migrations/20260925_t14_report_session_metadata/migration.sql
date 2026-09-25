-- Phase 0 T14 (additive): columns interview/report.generate already wrote.
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "sessionConfidence" TEXT;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "sessionStabilityMetadata" JSONB;

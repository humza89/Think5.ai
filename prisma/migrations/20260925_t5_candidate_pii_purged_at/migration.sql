-- Phase 0 T5: retention purge marker (additive)
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "piiPurgedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Candidate_piiPurgedAt_idx" ON "Candidate"("piiPurgedAt");

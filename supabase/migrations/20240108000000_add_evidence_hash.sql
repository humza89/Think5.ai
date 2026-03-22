-- Add evidence hash field for tamper-evident sealing of interview evidence bundles
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "evidenceHash" TEXT;

-- Comment for documentation
COMMENT ON COLUMN "InterviewReport"."evidenceHash" IS 'SHA-256 hash of transcript+report+recording for tamper detection';

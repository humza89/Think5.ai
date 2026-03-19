-- Audit Remediation: consent privacy, report status tracking
-- Fixes from post-implementation enterprise audit

-- Interview: privacy consent field (C1 fix)
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "consentPrivacy" BOOLEAN NOT NULL DEFAULT false;

-- Interview: report generation status tracking (H2 fix)
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reportStatus" TEXT DEFAULT 'pending';
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reportRetryCount" INTEGER NOT NULL DEFAULT 0;

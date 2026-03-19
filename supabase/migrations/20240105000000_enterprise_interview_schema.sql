-- Enterprise AI Interview Schema Additions
-- Adds: recording consent, versioning, screen share, multi-tenant, risk signals, retention, SSO

-- Interview: consent, versioning, screen share, multi-tenant
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "consentRecording" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "consentProctoring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "consentedAt" TIMESTAMPTZ;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "interviewPlanVersion" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "screenRecordingUrl" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "screenRecordingSize" INTEGER;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "companyId" TEXT REFERENCES "Client"("id") ON DELETE SET NULL;

-- InterviewReport: model/rubric versioning
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "scorerModelVersion" TEXT;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "scorerPromptVersion" TEXT;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "rubricVersion" TEXT;

-- Candidate: risk signals, LinkedIn consistency, demographics
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "riskScore" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "riskFlags" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "linkedinConsistencyScore" DOUBLE PRECISION;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "linkedinConsistencyFlags" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "demographicData" JSONB;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "demographicConsentGiven" BOOLEAN NOT NULL DEFAULT false;

-- RetentionPolicy table
CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "recordingDays" INTEGER NOT NULL DEFAULT 90,
  "transcriptDays" INTEGER NOT NULL DEFAULT 365,
  "candidateDataDays" INTEGER NOT NULL DEFAULT 730,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- SSOConfig table
CREATE TABLE IF NOT EXISTS "SSOConfig" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "metadataUrl" TEXT,
  "entityId" TEXT,
  "certificate" TEXT,
  "domain" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SSOConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SSOConfig_companyId_key" UNIQUE ("companyId"),
  CONSTRAINT "SSOConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SSOConfig_domain_idx" ON "SSOConfig"("domain");

-- Insert default retention policy
INSERT INTO "RetentionPolicy" ("id", "name", "recordingDays", "transcriptDays", "candidateDataDays", "isDefault")
VALUES (gen_random_uuid()::text, 'Default Policy', 90, 365, 730, true)
ON CONFLICT DO NOTHING;

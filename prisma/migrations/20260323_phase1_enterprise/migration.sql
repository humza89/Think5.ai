-- Phase 1 Enterprise Remediation: Evidence Bundle + Invitation Lifecycle
-- Run this in Supabase SQL Editor

-- ══════════════════════════════════════════════════════════════════
-- 1. EvidenceBundle table (Issue 5)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "EvidenceBundle" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "compiledAt" TIMESTAMP(3) NOT NULL,
    "artifactManifest" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "evidenceItems" JSONB NOT NULL,
    "versioning" JSONB NOT NULL,
    "consent" JSONB,
    "integrityHash" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "exportFormat" TEXT,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceBundle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EvidenceBundle_interviewId_key" ON "EvidenceBundle"("interviewId");

ALTER TABLE "EvidenceBundle"
  ADD CONSTRAINT "EvidenceBundle_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════
-- 2. InvitationStatus enum additions (Issue 2)
-- ══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CREATED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'CREATED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DELIVERED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'DELIVERED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REVOKED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'REVOKED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'INTERVIEW_STARTED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'INTERVIEW_STARTED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'INTERVIEW_COMPLETED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'INTERVIEW_COMPLETED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ABANDONED' AND enumtypid = '"InvitationStatus"'::regtype) THEN
    ALTER TYPE "InvitationStatus" ADD VALUE 'ABANDONED';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 3. InterviewInvitation lifecycle columns (Issue 2)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE "InterviewInvitation" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "InterviewInvitation" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "InterviewInvitation" ADD COLUMN IF NOT EXISTS "revokedBy" TEXT;

-- ══════════════════════════════════════════════════════════════════
-- 4. InterviewTemplateVersion table (Issue 4 — Template Governance)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "InterviewTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeNotes" TEXT,
    "promotedBy" TEXT,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isShadow" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewTemplateVersion_templateId_version_key"
  ON "InterviewTemplateVersion"("templateId", "version");
CREATE INDEX IF NOT EXISTS "InterviewTemplateVersion_templateId_idx"
  ON "InterviewTemplateVersion"("templateId");

ALTER TABLE "InterviewTemplateVersion"
  ADD CONSTRAINT "InterviewTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "InterviewTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. InterviewTemplate shadow + deprecation + screen share columns
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "isShadow" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "deprecatedAt" TIMESTAMP(3);
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "deprecationReason" TEXT;
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "screenShareRequired" BOOLEAN NOT NULL DEFAULT false;

-- ══════════════════════════════════════════════════════════════════
-- 6. ScreenCaptureSession table (Issue 1 — Screen Share)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ScreenCaptureSession" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "captureType" TEXT NOT NULL DEFAULT 'screen_share',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "thumbnailUrls" JSONB,
    "recordingUrl" TEXT,
    "recordingSize" INT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreenCaptureSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScreenCaptureSession_interviewId_idx"
  ON "ScreenCaptureSession"("interviewId");

ALTER TABLE "ScreenCaptureSession"
  ADD CONSTRAINT "ScreenCaptureSession_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════
-- 7. InterviewSection coverage columns (Issue 7)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE "InterviewSection" ADD COLUMN IF NOT EXISTS "evidenceSufficiency" TEXT;
ALTER TABLE "InterviewSection" ADD COLUMN IF NOT EXISTS "objectivesCovered" JSONB;

-- ══════════════════════════════════════════════════════════════════
-- 8. Sharing governance (Issue 10)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "shareScopes" JSONB;

-- ══════════════════════════════════════════════════════════════════
-- 9. RetentionPolicy metadata + Client budget (Issues 10, 11)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE "RetentionPolicy" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "monthlyAiBudgetUsd" DOUBLE PRECISION;

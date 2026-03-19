-- Think5 Enterprise Audit Remediation
-- Adds: template snapshots, recording state machine, voice session reconnect,
--        review governance, shared report access logging, accommodations,
--        retake tracking, readiness checks, candidate report policy

-- New enums
DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'OVERRIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewDecisionType" AS ENUM ('APPROVE', 'REJECT', 'FLAG', 'OVERRIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Interview: template snapshot and audit trail
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "templateSnapshot" JSONB;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "templateSnapshotHash" TEXT;

-- Interview: recording pipeline state machine
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "recordingState" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "recordingManifestHash" TEXT;

-- Interview: voice session reconnect
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reconnectToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Interview_reconnectToken_key" ON "Interview"("reconnectToken");

-- Interview: accessibility accommodations
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "accommodations" JSONB;

-- Interview: retake tracking
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "retakeOfInterviewId" TEXT;

-- Interview: browser readiness
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "readinessVerified" BOOLEAN NOT NULL DEFAULT false;

-- InterviewReport: human review governance
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;

-- InterviewReport: shared report governance
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "sharePurpose" TEXT;
ALTER TABLE "InterviewReport" ADD COLUMN IF NOT EXISTS "shareRevoked" BOOLEAN NOT NULL DEFAULT false;

-- InterviewTemplate: candidate report policy
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "candidateReportPolicy" JSONB;
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "retakePolicy" JSONB;
ALTER TABLE "InterviewTemplate" ADD COLUMN IF NOT EXISTS "readinessCheckRequired" BOOLEAN NOT NULL DEFAULT false;

-- ReviewDecision table (human review governance)
CREATE TABLE IF NOT EXISTS "ReviewDecision" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "interviewId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewerEmail" TEXT,
  "decision" "ReviewDecisionType" NOT NULL,
  "overrideReason" TEXT,
  "previousRecommendation" TEXT,
  "newRecommendation" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewDecision_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReviewDecision_interviewId_idx" ON "ReviewDecision"("interviewId");
CREATE INDEX IF NOT EXISTS "ReviewDecision_reviewerId_idx" ON "ReviewDecision"("reviewerId");
CREATE INDEX IF NOT EXISTS "ReviewDecision_createdAt_idx" ON "ReviewDecision"("createdAt");

-- ReportShareView table (access logging)
CREATE TABLE IF NOT EXISTS "ReportShareView" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "reportId" TEXT NOT NULL,
  "shareToken" TEXT NOT NULL,
  "viewerIp" TEXT,
  "userAgent" TEXT,
  "viewedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ReportShareView_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportShareView_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InterviewReport"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReportShareView_reportId_idx" ON "ReportShareView"("reportId");
CREATE INDEX IF NOT EXISTS "ReportShareView_shareToken_idx" ON "ReportShareView"("shareToken");

-- Additional index on Interview.reconnectToken
CREATE INDEX IF NOT EXISTS "Interview_reconnectToken_idx" ON "Interview"("reconnectToken");

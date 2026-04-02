-- Add all missing tables that exist in Prisma schema but not in the database.
-- Uses IF NOT EXISTS for idempotent execution.

-- 1. InterviewTranscript
CREATE TABLE IF NOT EXISTS "InterviewTranscript" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "turnId" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "causalParentTurnId" TEXT,
    "generationMetadata" JSONB,
    "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientTimestamp" TIMESTAMP(3),
    "contentChecksum" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT true,
    "memoryChecksum" TEXT,
    "sequenceNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewTranscript_interviewId_turnIndex_key" ON "InterviewTranscript"("interviewId", "turnIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewTranscript_interviewId_turnId_key" ON "InterviewTranscript"("interviewId", "turnId");
CREATE INDEX IF NOT EXISTS "InterviewTranscript_interviewId_idx" ON "InterviewTranscript"("interviewId");
ALTER TABLE "InterviewTranscript" ADD CONSTRAINT "InterviewTranscript_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. InterviewEvent
CREATE TABLE IF NOT EXISTS "InterviewEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "turnIndex" INTEGER,
    "causalEventId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterviewEvent_interviewId_timestamp_idx" ON "InterviewEvent"("interviewId", "timestamp");
CREATE INDEX IF NOT EXISTS "InterviewEvent_interviewId_eventType_idx" ON "InterviewEvent"("interviewId", "eventType");
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. InterviewFact
CREATE TABLE IF NOT EXISTS "InterviewFact" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedBy" TEXT NOT NULL,

    CONSTRAINT "InterviewFact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterviewFact_interviewId_factType_idx" ON "InterviewFact"("interviewId", "factType");
CREATE INDEX IF NOT EXISTS "InterviewFact_interviewId_idx" ON "InterviewFact"("interviewId");
ALTER TABLE "InterviewFact" ADD CONSTRAINT "InterviewFact_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. InterviewCommitment
CREATE TABLE IF NOT EXISTS "InterviewCommitment" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "InterviewCommitment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterviewCommitment_interviewId_idx" ON "InterviewCommitment"("interviewId");
ALTER TABLE "InterviewCommitment" ADD CONSTRAINT "InterviewCommitment_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. InterviewContradiction
CREATE TABLE IF NOT EXISTS "InterviewContradiction" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "claimTurnId" TEXT NOT NULL,
    "evidenceTurnId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewContradiction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InterviewContradiction_interviewId_idx" ON "InterviewContradiction"("interviewId");
ALTER TABLE "InterviewContradiction" ADD CONSTRAINT "InterviewContradiction_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. TurnFragment
CREATE TABLE IF NOT EXISTS "TurnFragment" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "partialContent" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interruptedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_progress',

    CONSTRAINT "TurnFragment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TurnFragment_interviewId_chunkId_key" ON "TurnFragment"("interviewId", "chunkId");
CREATE INDEX IF NOT EXISTS "TurnFragment_interviewId_status_idx" ON "TurnFragment"("interviewId", "status");
ALTER TABLE "TurnFragment" ADD CONSTRAINT "TurnFragment_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. InterviewerStateSnapshot
CREATE TABLE IF NOT EXISTS "InterviewerStateSnapshot" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "interviewId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "stateJson" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewerStateSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewerStateSnapshot_interviewId_turnIndex_key" ON "InterviewerStateSnapshot"("interviewId", "turnIndex");
CREATE INDEX IF NOT EXISTS "InterviewerStateSnapshot_interviewId_idx" ON "InterviewerStateSnapshot"("interviewId");
ALTER TABLE "InterviewerStateSnapshot" ADD CONSTRAINT "InterviewerStateSnapshot_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. WebhookEndpoint
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_companyId_isActive_idx" ON "WebhookEndpoint"("companyId", "isActive");
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. WebhookDelivery
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_event_idx" ON "WebhookDelivery"("event");
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. DataDeletionRequest
CREATE TABLE IF NOT EXISTS "DataDeletionRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gracePeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reason" TEXT,
    "dataManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_candidateId_idx" ON "DataDeletionRequest"("candidateId");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_status_idx" ON "DataDeletionRequest"("status");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_gracePeriodEndsAt_idx" ON "DataDeletionRequest"("gracePeriodEndsAt");
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11. GovernancePolicy
CREATE TABLE IF NOT EXISTS "GovernancePolicy" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "companyId" TEXT NOT NULL,
    "canOverrideScore" TEXT[] DEFAULT ARRAY['admin']::TEXT[],
    "canRedactTranscript" TEXT[] DEFAULT ARRAY['admin']::TEXT[],
    "canSuppressReport" TEXT[] DEFAULT ARRAY['admin']::TEXT[],
    "requireReviewBelow" DOUBLE PRECISION,
    "autoPublishAbove" DOUBLE PRECISION,
    "enforced" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GovernancePolicy_companyId_key" ON "GovernancePolicy"("companyId");
ALTER TABLE "GovernancePolicy" ADD CONSTRAINT "GovernancePolicy_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

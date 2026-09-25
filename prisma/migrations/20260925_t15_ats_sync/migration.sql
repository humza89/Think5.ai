-- Phase 0 T15 (additive): ATS sync runs and entity links.
CREATE TABLE IF NOT EXISTS "ATSSyncRun" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "counts" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ATSSyncRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ATSSyncRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ATSIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ATSSyncRun_integrationId_startedAt_idx" ON "ATSSyncRun"("integrationId", "startedAt");
CREATE INDEX IF NOT EXISTS "ATSSyncRun_status_idx" ON "ATSSyncRun"("status");

CREATE TABLE IF NOT EXISTS "ATSEntityLink" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "localType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "remoteUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT,
    "state" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ATSEntityLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ATSEntityLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ATSIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ATSEntityLink_integrationId_localType_localId_key" ON "ATSEntityLink"("integrationId", "localType", "localId");
CREATE UNIQUE INDEX IF NOT EXISTS "ATSEntityLink_integrationId_localType_remoteId_key" ON "ATSEntityLink"("integrationId", "localType", "remoteId");
CREATE INDEX IF NOT EXISTS "ATSEntityLink_integrationId_localType_idx" ON "ATSEntityLink"("integrationId", "localType");

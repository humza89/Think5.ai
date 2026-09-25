-- Phase 0 T16: usage metering foundation (additive)
CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unit" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UsageEvent_tenantId_kind_occurredAt_idx" ON "UsageEvent"("tenantId", "kind", "occurredAt");
CREATE INDEX IF NOT EXISTS "UsageEvent_subjectType_subjectId_idx" ON "UsageEvent"("subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "UsageEvent_recordedAt_idx" ON "UsageEvent"("recordedAt");

CREATE TABLE IF NOT EXISTS "UsageAggregate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "eventCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageAggregate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UsageAggregate_tenantId_kind_period_periodStart_key" ON "UsageAggregate"("tenantId", "kind", "period", "periodStart");
CREATE INDEX IF NOT EXISTS "UsageAggregate_tenantId_period_periodStart_idx" ON "UsageAggregate"("tenantId", "period", "periodStart");

CREATE TABLE IF NOT EXISTS "TenantQuota" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "limit" DECIMAL(20,6) NOT NULL,
  "window" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantQuota_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TenantQuota_tenantId_feature_key" ON "TenantQuota"("tenantId", "feature");
CREATE INDEX IF NOT EXISTS "TenantQuota_tenantId_idx" ON "TenantQuota"("tenantId");

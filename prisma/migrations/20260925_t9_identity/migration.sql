-- Phase 0 T9 (additive): MFA recovery codes, non-candidate account deletion
-- requests, tenant-admin flag and tenant MFA policy. No column is renamed,
-- dropped or retyped.
ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "isTenantAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GovernancePolicy" ADD COLUMN IF NOT EXISTS "requireMfa" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MfaRecoveryCode_userId_codeHash_key" ON "MfaRecoveryCode"("userId", "codeHash");
CREATE INDEX IF NOT EXISTS "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode"("userId");

CREATE TABLE IF NOT EXISTS "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gracePeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_userId_idx" ON "AccountDeletionRequest"("userId");
CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_status_idx" ON "AccountDeletionRequest"("status");
CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_gracePeriodEndsAt_idx" ON "AccountDeletionRequest"("gracePeriodEndsAt");

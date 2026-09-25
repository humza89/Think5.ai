-- Phase 0 T11 (additive): Postgres-authoritative lease table for the
-- InterviewSessionStore contract. No existing table is altered.
CREATE TABLE IF NOT EXISTS "InterviewLease" (
    "interviewId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewLease_pkey" PRIMARY KEY ("interviewId")
);

CREATE INDEX IF NOT EXISTS "InterviewLease_expiresAt_idx" ON "InterviewLease"("expiresAt");

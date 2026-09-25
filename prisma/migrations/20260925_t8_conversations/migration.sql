-- Phase 0 T8: canonical conversations (additive)
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "participantAId" TEXT NOT NULL,
  "participantARole" "MessageSenderRole" NOT NULL,
  "participantBId" TEXT NOT NULL,
  "participantBRole" "MessageSenderRole" NOT NULL,
  "tenantId" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "lastMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_participantAId_participantBId_key" ON "Conversation"("participantAId", "participantBId");
CREATE INDEX IF NOT EXISTS "Conversation_participantAId_lastMessageAt_idx" ON "Conversation"("participantAId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "Conversation_participantBId_lastMessageAt_idx" ON "Conversation"("participantBId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_idx" ON "Conversation"("tenantId");
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

/**
 * Turn Fragment Store — Server-side persistence of in-progress turn chunks
 *
 * N4: Stores partial turn content server-side so interrupted turns
 * are not lost on client disconnect. Fragments are cleaned up
 * after the turn is finalized via turn-commit.
 */

import { prisma } from "@/lib/prisma";

// ── Core Operations ──────────────────────────────────────────────────

/**
 * Persist a turn fragment chunk to the database.
 * Upserts by (interviewId, chunkId) to handle retransmissions.
 */
export async function persistFragment(
  interviewId: string,
  chunkId: string,
  role: string,
  content: string,
  status: "in_progress" | "interrupted" | "resumed" | "finalized" = "in_progress"
): Promise<void> {
  await prisma.turnFragment.upsert({
    where: {
      interviewId_chunkId: { interviewId, chunkId },
    },
    update: {
      partialContent: content,
      status,
      ...(status === "interrupted" ? { interruptedAt: new Date() } : {}),
      ...(status === "resumed" ? { resumedAt: new Date() } : {}),
    },
    create: {
      interviewId,
      chunkId,
      role,
      partialContent: content,
      status,
    },
  });
}

/**
 * Retrieve incomplete (non-finalized) fragments for an interview.
 * Used on reconnect to restore context from interrupted turns.
 */
export async function getIncompleteFragments(
  interviewId: string
): Promise<Array<{
  chunkId: string;
  role: string;
  partialContent: string;
  status: string;
  startedAt: Date;
  interruptedAt: Date | null;
}>> {
  return prisma.turnFragment.findMany({
    where: {
      interviewId,
      status: { in: ["in_progress", "interrupted", "resumed"] },
    },
    orderBy: { startedAt: "asc" },
    select: {
      chunkId: true,
      role: true,
      partialContent: true,
      status: true,
      startedAt: true,
      interruptedAt: true,
    },
  });
}

/**
 * Mark a fragment as finalized (turn was committed to ledger).
 */
export async function markFragmentComplete(
  interviewId: string,
  chunkId: string
): Promise<void> {
  await prisma.turnFragment.updateMany({
    where: { interviewId, chunkId },
    data: { status: "finalized" },
  });
}

/**
 * Clean up finalized fragments older than 5 minutes.
 * Called after successful turn commit (non-blocking).
 */
export async function cleanupCompletedFragments(
  interviewId: string
): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const result = await prisma.turnFragment.deleteMany({
    where: {
      interviewId,
      status: "finalized",
      startedAt: { lt: fiveMinutesAgo },
    },
  });
  return result.count;
}

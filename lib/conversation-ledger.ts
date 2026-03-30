/**
 * Conversation Ledger — Server-authoritative, append-only turn log
 *
 * The canonical source of truth for every utterance in an interview.
 * Backed by PostgreSQL via InterviewTranscript. Never truncated, never summarized.
 *
 * Redis session state stores only a pointer (lastTurnIndex) to this ledger.
 */

import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────

export interface LedgerTurn {
  role: string;
  content: string;
  timestamp: string;
  turnId?: string;
  causalParentTurnId?: string;
  generationMetadata?: Record<string, unknown>;
  clientTimestamp?: string;
  finalized?: boolean;
}

export interface LedgerSnapshot {
  turnCount: number;
  latestTurnIndex: number;
  latestTurnId: string | null;
  checksum: string;
}

export interface StoredTurn {
  id: string;
  turnIndex: number;
  turnId: string;
  role: string;
  content: string;
  timestamp: Date;
  serverReceivedAt: Date;
  clientTimestamp: Date | null;
  causalParentTurnId: string | null;
  generationMetadata: unknown;
  checkpointVersion: number;
  finalized: boolean;
}

// ── Core Operations ──────────────────────────────────────────────────

/**
 * Append new turns to the ledger in a single transaction.
 * Assigns monotonic turnIndex starting from the current max + 1.
 * Returns the new turns with their assigned turnIndex and turnId.
 *
 * Event-sourcing guarantees:
 * - Idempotent: duplicate turnIds are silently skipped (no-op)
 * - Monotonic: turnIndex is always lastIndex + 1
 * - Integrity: SHA-256 content checksum on every turn
 */
export async function appendTurns(
  interviewId: string,
  turns: LedgerTurn[],
  checkpointVersion?: number
): Promise<StoredTurn[]> {
  if (turns.length === 0) return [];

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Get the current max turnIndex for this interview
    const lastTurn = await tx.interviewTranscript.findFirst({
      where: { interviewId },
      orderBy: { turnIndex: "desc" },
      select: { turnIndex: true },
    });

    const startIndex = (lastTurn?.turnIndex ?? -1) + 1;
    const version = checkpointVersion ?? 0;
    const now = new Date();

    // Idempotent: filter out turns with turnIds already in the ledger
    const incomingTurnIds = turns
      .map((t) => t.turnId)
      .filter((id): id is string => !!id);
    const existingTurnIds = new Set<string>();
    if (incomingTurnIds.length > 0) {
      const existing = await tx.interviewTranscript.findMany({
        where: { interviewId, turnId: { in: incomingTurnIds } },
        select: { turnId: true },
      });
      for (const e of existing) existingTurnIds.add(e.turnId);
    }

    const results: StoredTurn[] = [];
    let indexOffset = 0;

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const turnId = turn.turnId || randomUUID();

      // Idempotent: skip duplicate turnIds
      if (existingTurnIds.has(turnId)) continue;

      const turnIndex = startIndex + indexOffset;

      // Compute SHA-256 content checksum for integrity verification
      const contentChecksum = createHash("sha256")
        .update(`${turn.role}:${turn.content}`)
        .digest("hex")
        .slice(0, 16);

      const created = await tx.interviewTranscript.create({
        data: {
          interviewId,
          role: turn.role,
          content: turn.content,
          turnIndex,
          turnId,
          causalParentTurnId: turn.causalParentTurnId || null,
          generationMetadata: (turn.generationMetadata as any) || undefined,
          checkpointVersion: version,
          timestamp: turn.timestamp ? new Date(turn.timestamp) : now,
          serverReceivedAt: now,
          clientTimestamp: turn.clientTimestamp ? new Date(turn.clientTimestamp) : null,
          contentChecksum,
          finalized: turn.finalized ?? false,
        },
      });

      results.push({
        id: created.id,
        turnIndex: created.turnIndex,
        turnId: created.turnId,
        role: created.role,
        content: created.content,
        timestamp: created.timestamp,
        serverReceivedAt: created.serverReceivedAt,
        clientTimestamp: created.clientTimestamp,
        causalParentTurnId: created.causalParentTurnId,
        generationMetadata: created.generationMetadata,
        checkpointVersion: created.checkpointVersion,
        finalized: created.finalized,
      });

      indexOffset++;
    }

    return results;
  });
}

/**
 * Commit a single turn atomically with version assertion.
 * Used by the turn-commit protocol for per-turn server verification.
 *
 * @param expectedVersion - The expected current ledger version (last turnIndex).
 *   If the actual version doesn't match, the commit is rejected (STALE_VERSION).
 * @returns The committed turn or null if version mismatch / duplicate.
 */
export async function commitSingleTurn(
  interviewId: string,
  turn: LedgerTurn,
  expectedVersion: number
): Promise<{ committed: boolean; turn?: StoredTurn; reason?: string; currentVersion?: number }> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Version assertion: current ledger must match expectedVersion
    const lastTurn = await tx.interviewTranscript.findFirst({
      where: { interviewId },
      orderBy: { turnIndex: "desc" },
      select: { turnIndex: true },
    });
    const currentVersion = lastTurn?.turnIndex ?? -1;

    if (currentVersion !== expectedVersion) {
      return {
        committed: false,
        reason: "STALE_VERSION",
        currentVersion,
      };
    }

    // 2. Idempotent: check for duplicate turnId
    const turnId = turn.turnId || randomUUID();
    if (turn.turnId) {
      const existing = await tx.interviewTranscript.findFirst({
        where: { interviewId, turnId },
        select: { turnIndex: true },
      });
      if (existing) {
        return { committed: true, reason: "DUPLICATE_NOOP", currentVersion };
      }
    }

    // 3. Append with monotonic index
    const turnIndex = currentVersion + 1;
    const contentChecksum = createHash("sha256")
      .update(`${turn.role}:${turn.content}`)
      .digest("hex")
      .slice(0, 16);

    const now = new Date();
    const created = await tx.interviewTranscript.create({
      data: {
        interviewId,
        role: turn.role,
        content: turn.content,
        turnIndex,
        turnId,
        causalParentTurnId: turn.causalParentTurnId || null,
        generationMetadata: (turn.generationMetadata as any) || undefined,
        checkpointVersion: 0,
        timestamp: turn.timestamp ? new Date(turn.timestamp) : now,
        serverReceivedAt: now,
        clientTimestamp: turn.clientTimestamp ? new Date(turn.clientTimestamp) : null,
        contentChecksum,
        finalized: turn.finalized ?? false,
      },
    });

    return {
      committed: true,
      turn: mapRow(created),
      currentVersion: turnIndex,
    };
  });
}

/**
 * Verify content integrity by recomputing checksums against stored values.
 * Returns turns with mismatched checksums (empty array = all valid).
 */
export async function verifyContentIntegrity(
  interviewId: string
): Promise<Array<{ turnIndex: number; turnId: string; expected: string; actual: string }>> {
  const rows = await prisma.interviewTranscript.findMany({
    where: { interviewId },
    orderBy: { turnIndex: "asc" },
    select: { turnIndex: true, turnId: true, role: true, content: true, contentChecksum: true },
  });

  const mismatches: Array<{ turnIndex: number; turnId: string; expected: string; actual: string }> = [];
  for (const row of rows) {
    if (!row.contentChecksum) continue;
    const computed = createHash("sha256")
      .update(`${row.role}:${row.content}`)
      .digest("hex")
      .slice(0, 16);
    if (computed !== row.contentChecksum) {
      mismatches.push({
        turnIndex: row.turnIndex,
        turnId: row.turnId,
        expected: row.contentChecksum,
        actual: computed,
      });
    }
  }
  return mismatches;
}

/**
 * Retrieve turns added after a given turnIndex (for delta sync on reconnect).
 */
export async function getTurnsSince(
  interviewId: string,
  afterTurnIndex: number
): Promise<StoredTurn[]> {
  const rows = await prisma.interviewTranscript.findMany({
    where: {
      interviewId,
      turnIndex: { gt: afterTurnIndex },
    },
    orderBy: { turnIndex: "asc" },
  });

  return rows.map(mapRow);
}

/**
 * Retrieve the FULL transcript. Never truncates — this is the Tier 0 guarantee.
 */
export async function getFullTranscript(
  interviewId: string
): Promise<StoredTurn[]> {
  const rows = await prisma.interviewTranscript.findMany({
    where: { interviewId },
    orderBy: { turnIndex: "asc" },
  });

  return rows.map(mapRow);
}

/**
 * Get a snapshot of the ledger state for reconciliation.
 * Checksum = SHA-256 of concatenated turnIds in order.
 */
export async function getLedgerSnapshot(
  interviewId: string
): Promise<LedgerSnapshot> {
  const rows = await prisma.interviewTranscript.findMany({
    where: { interviewId },
    orderBy: { turnIndex: "asc" },
    select: { turnIndex: true, turnId: true },
  });

  if (rows.length === 0) {
    return {
      turnCount: 0,
      latestTurnIndex: -1,
      latestTurnId: null,
      checksum: createHash("sha256").update("").digest("hex"),
    };
  }

  const turnIds = rows.map((r: { turnIndex: number; turnId: string }) => r.turnId);
  const checksum = createHash("sha256")
    .update(turnIds.join(":"))
    .digest("hex");

  const last = rows[rows.length - 1];

  return {
    turnCount: rows.length,
    latestTurnIndex: last.turnIndex,
    latestTurnId: last.turnId,
    checksum,
  };
}

/**
 * Retrieve a window of turns within a token budget.
 * Prioritizes recent turns. Returns as many turns as fit within the budget.
 *
 * @param tokenBudget - Approximate character budget (4 chars ≈ 1 token)
 */
export async function getLedgerWindow(
  interviewId: string,
  fromTurnIndex: number,
  maxTurns: number = 100,
  tokenBudget?: number
): Promise<StoredTurn[]> {
  const rows = await prisma.interviewTranscript.findMany({
    where: {
      interviewId,
      turnIndex: { gte: fromTurnIndex },
    },
    orderBy: { turnIndex: "asc" },
    take: maxTurns,
  });

  if (!tokenBudget) {
    return rows.map(mapRow);
  }

  // Apply token budget — include turns from most recent backward until budget exhausted
  const mapped = rows.map(mapRow);
  const result: StoredTurn[] = [];
  let usedChars = 0;

  // Start from most recent and work backward to prioritize recent context
  for (let i = mapped.length - 1; i >= 0; i--) {
    const turnChars = mapped[i].content.length + mapped[i].role.length + 20; // overhead
    if (usedChars + turnChars > tokenBudget) break;
    usedChars += turnChars;
    result.unshift(mapped[i]);
  }

  return result;
}

/**
 * Finalize all turns for an interview (marks them as immutable).
 * Called at end-of-interview.
 */
export async function finalizeLedger(interviewId: string): Promise<number> {
  const result = await prisma.interviewTranscript.updateMany({
    where: { interviewId, finalized: false },
    data: { finalized: true },
  });
  return result.count;
}

/**
 * Diff incoming turns against the ledger to find new turns not yet persisted.
 * Compares by turnIndex: any turn with turnIndex > latestTurnIndex is new.
 */
export function diffTurns(
  incomingTurns: Array<{ role: string; content: string; timestamp: string }>,
  ledgerLatestIndex: number
): LedgerTurn[] {
  // Incoming turns are 0-indexed from client. Ledger turnIndex is monotonic.
  // New turns = those at positions beyond what the ledger already has.
  if (incomingTurns.length <= ledgerLatestIndex + 1) return [];

  return incomingTurns.slice(ledgerLatestIndex + 1).map((t) => ({
    role: t.role,
    content: t.content,
    timestamp: t.timestamp,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  turnIndex: number;
  turnId: string;
  role: string;
  content: string;
  timestamp: Date;
  serverReceivedAt: Date;
  clientTimestamp: Date | null;
  causalParentTurnId: string | null;
  generationMetadata: unknown;
  checkpointVersion: number;
  finalized: boolean;
}): StoredTurn {
  return {
    id: row.id,
    turnIndex: row.turnIndex,
    turnId: row.turnId,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    serverReceivedAt: row.serverReceivedAt,
    clientTimestamp: row.clientTimestamp,
    causalParentTurnId: row.causalParentTurnId,
    generationMetadata: row.generationMetadata,
    checkpointVersion: row.checkpointVersion,
    finalized: row.finalized,
  };
}

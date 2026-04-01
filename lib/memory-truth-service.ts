/**
 * Memory Truth Service — Single source of truth for what Aria "knows"
 *
 * Consolidates the canonical turn graph, extracted facts, unresolved
 * questions, contradictions, and commitments into one auditable model.
 *
 * Replaces scattered multi-store memory assembly with a unified
 * service that can answer: "What does Aria know about the candidate?"
 */

import type { Commitment, Contradiction, PendingClarification } from "./interviewer-state";

// ── Types ────────────────────────────────────────────────────────────

export interface TurnNode {
  turnId: string;
  turnIndex: number;
  role: string;
  content: string;
  factIds: string[];
  causalParentId: string | null;
  timestamp: Date;
  /** N8: Which candidate turns ground this AI turn */
  sourceTurnIds?: string[];
}

export interface CanonicalFact {
  id: string;
  factType: string;
  content: string;
  confidence: number;
  turnId: string;
  extractedBy: string;
  createdAt: Date;
}

export interface UnresolvedQuestion {
  questionText: string;
  turnId: string;
  turnIndex: number;
  askedAt: Date;
  /** Whether a candidate response was received */
  answered: boolean;
}

export interface MemoryTruth {
  turnGraph: TurnNode[];
  canonicalFacts: CanonicalFact[];
  unresolvedQuestions: UnresolvedQuestion[];
  contradictions: Contradiction[];
  commitments: Commitment[];
  /** N8: Bidirectional reference index — for each turn, which turns cite it */
  turnReferences: Record<string, string[]>;
  /** Computed integrity metrics */
  integrity: {
    totalTurns: number;
    totalFacts: number;
    unresolvedCount: number;
    contradictionCount: number;
    unfulfilledCommitments: number;
    factDensity: number; // facts per turn
  };
}

// ── Build Memory Truth ───────────────────────────────────────────────

/**
 * Build the canonical memory truth from database records.
 * This is the single authoritative view of what Aria remembers.
 */
export async function buildMemoryTruth(interviewId: string): Promise<MemoryTruth> {
  const { prisma } = await import("@/lib/prisma");
  const { deserializeState, createInitialState } = await import("@/lib/interviewer-state");
  const { getSessionState } = await import("@/lib/session-store");

  // 1. Load turn graph from canonical ledger (include generationMetadata for N8 sourceTurnIds)
  const transcriptRows = await prisma.interviewTranscript.findMany({
    where: { interviewId },
    orderBy: { turnIndex: "asc" },
    select: {
      turnId: true,
      turnIndex: true,
      role: true,
      content: true,
      causalParentTurnId: true,
      timestamp: true,
      generationMetadata: true,
    },
  });

  // 2. Load all facts with their source turns
  const factRows = await prisma.interviewFact.findMany({
    where: { interviewId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      factType: true,
      content: true,
      confidence: true,
      turnId: true,
      extractedBy: true,
      createdAt: true,
    },
  });

  // 3. Build fact-to-turn index
  const factsByTurn = new Map<string, string[]>();
  for (const fact of factRows) {
    const existing = factsByTurn.get(fact.turnId) || [];
    existing.push(fact.id);
    factsByTurn.set(fact.turnId, existing);
  }

  // 4. Build turn graph — N8: extract sourceTurnIds from generationMetadata
  const turnGraph: TurnNode[] = transcriptRows.map((row: { turnId: string; turnIndex: number; role: string; content: string; causalParentTurnId: string | null; timestamp: Date; generationMetadata: unknown }) => {
    const meta = row.generationMetadata as Record<string, unknown> | null;
    const sourceTurnIds = Array.isArray(meta?.sourceTurnIds) ? (meta.sourceTurnIds as string[]) : undefined;
    return {
      turnId: row.turnId,
      turnIndex: row.turnIndex,
      role: row.role,
      content: row.content,
      factIds: factsByTurn.get(row.turnId) || [],
      causalParentId: row.causalParentTurnId,
      timestamp: row.timestamp,
      sourceTurnIds,
    };
  });

  // 5. Canonical facts (deduplicated by content, highest confidence wins)
  const factMap = new Map<string, CanonicalFact>();
  for (const f of factRows) {
    const key = `${f.factType}:${f.content.toLowerCase().trim()}`;
    const existing = factMap.get(key);
    if (!existing || f.confidence > existing.confidence) {
      factMap.set(key, {
        id: f.id,
        factType: f.factType,
        content: f.content,
        confidence: f.confidence,
        turnId: f.turnId,
        extractedBy: f.extractedBy,
        createdAt: f.createdAt,
      });
    }
  }
  const canonicalFacts = Array.from(factMap.values());

  // 6. Detect unresolved questions (AI asked, candidate hasn't responded)
  const unresolvedQuestions: UnresolvedQuestion[] = [];
  for (let i = 0; i < turnGraph.length; i++) {
    const turn = turnGraph[i];
    if ((turn.role === "interviewer" || turn.role === "model" || turn.role === "assistant") && turn.content.includes("?")) {
      const nextTurn = turnGraph[i + 1];
      const answered = nextTurn && (nextTurn.role === "candidate" || nextTurn.role === "user");
      if (!answered) {
        unresolvedQuestions.push({
          questionText: extractQuestion(turn.content) || turn.content.slice(0, 200),
          turnId: turn.turnId,
          turnIndex: turn.turnIndex,
          askedAt: turn.timestamp,
          answered: false,
        });
      }
    }
  }

  // 7. N7: Load contradictions and commitments from Postgres (canonical source)
  //    Falls back to Redis session state only if Postgres has no data.
  let contradictions: Contradiction[] = [];
  let commitments: Commitment[] = [];
  try {
    const [dbContradictions, dbCommitments] = await Promise.all([
      prisma.interviewContradiction.findMany({
        where: { interviewId },
        orderBy: { detectedAt: "asc" },
      }),
      prisma.interviewCommitment.findMany({
        where: { interviewId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (dbContradictions.length > 0 || dbCommitments.length > 0) {
      // Postgres is canonical — map to Contradiction/Commitment interface
      contradictions = dbContradictions.map((c: { claimTurnId: string; evidenceTurnId: string; description: string }) => ({
        turnIdA: c.claimTurnId,
        turnIdB: c.evidenceTurnId,
        description: c.description,
      }));
      commitments = dbCommitments.map((c: { description: string; turnId: string; status: string }) => ({
        description: c.description,
        turnId: c.turnId,
        fulfilled: c.status === "fulfilled",
      }));
    } else {
      // Fallback: try Redis session state (pre-N7 data)
      const session = await getSessionState(interviewId);
      if (session?.interviewerState) {
        const state = deserializeState(session.interviewerState);
        contradictions = state.contradictionMap;
        commitments = state.commitments;
      }
    }
  } catch {
    // Fall back to empty — fail-closed means no phantom data
  }

  // N8: Build bidirectional reference index
  const turnReferences: Record<string, string[]> = {};
  for (const turn of turnGraph) {
    if (turn.sourceTurnIds) {
      for (const refId of turn.sourceTurnIds) {
        if (!turnReferences[refId]) turnReferences[refId] = [];
        turnReferences[refId].push(turn.turnId);
      }
    }
  }

  // 8. Compute integrity metrics
  const totalTurns = turnGraph.length;
  const totalFacts = canonicalFacts.length;
  const unfulfilledCommitments = commitments.filter((c) => !c.fulfilled).length;

  return {
    turnGraph,
    canonicalFacts,
    unresolvedQuestions,
    contradictions,
    commitments,
    turnReferences,
    integrity: {
      totalTurns,
      totalFacts,
      unresolvedCount: unresolvedQuestions.length,
      contradictionCount: contradictions.length,
      unfulfilledCommitments,
      factDensity: totalTurns > 0 ? totalFacts / totalTurns : 0,
    },
  };
}

/**
 * Compute a recall score: what fraction of ground-truth facts are present
 * in the memory truth's canonical facts.
 */
export function computeFactRecall(
  memoryTruth: MemoryTruth,
  groundTruthFacts: Array<{ content: string; factType: string }>
): { recall: number; missing: string[] } {
  if (groundTruthFacts.length === 0) return { recall: 1.0, missing: [] };

  const missing: string[] = [];
  let matched = 0;

  for (const gt of groundTruthFacts) {
    const found = memoryTruth.canonicalFacts.some(
      (cf) =>
        cf.factType === gt.factType &&
        (cf.content.toLowerCase().includes(gt.content.toLowerCase()) ||
          gt.content.toLowerCase().includes(cf.content.toLowerCase()))
    );
    if (found) {
      matched++;
    } else {
      missing.push(`${gt.factType}: ${gt.content}`);
    }
  }

  return { recall: matched / groundTruthFacts.length, missing };
}

/**
 * Compute precision: what fraction of retrieved facts are actually correct
 * (no phantom facts that don't correspond to any transcript content).
 */
export function computeFactPrecision(
  memoryTruth: MemoryTruth
): { precision: number; phantomFacts: string[] } {
  if (memoryTruth.canonicalFacts.length === 0) return { precision: 1.0, phantomFacts: [] };

  const phantomFacts: string[] = [];
  const turnContentMap = new Map<string, string>();
  for (const turn of memoryTruth.turnGraph) {
    turnContentMap.set(turn.turnId, turn.content.toLowerCase());
  }

  for (const fact of memoryTruth.canonicalFacts) {
    const turnContent = turnContentMap.get(fact.turnId);
    if (!turnContent) {
      phantomFacts.push(`${fact.factType}: ${fact.content} (source turn missing)`);
      continue;
    }
    // Check if fact content has reasonable overlap with source turn
    const factWords = fact.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matchingWords = factWords.filter((w) => turnContent.includes(w));
    if (factWords.length > 0 && matchingWords.length / factWords.length < 0.3) {
      phantomFacts.push(`${fact.factType}: ${fact.content} (weak source match)`);
    }
  }

  const validCount = memoryTruth.canonicalFacts.length - phantomFacts.length;
  return {
    precision: validCount / memoryTruth.canonicalFacts.length,
    phantomFacts,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractQuestion(text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (sentences[i].trim().endsWith("?")) {
      return sentences[i].trim();
    }
  }
  return null;
}

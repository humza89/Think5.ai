/**
 * Memory Orchestrator — Unified memory packet composition
 *
 * Composes a single deterministic memory packet from all subsystems:
 * - InterviewerState (deterministic state machine)
 * - Tier 1 facts (regex-extracted verified claims)
 * - Knowledge graph (LLM-extracted semantic memory)
 * - Session state (module scores, difficulty, profile)
 * - Recent canonical turns (sliding window from conversation ledger)
 *
 * Eliminates fragmented multi-store memory assembly.
 * Called on reconnect and recovery to ensure complete context.
 */

import type { InterviewerState, FollowUpItem, Contradiction, PendingClarification } from "./interviewer-state";
import { createInitialState, deserializeState } from "./interviewer-state";
import type { SessionState, CandidateProfile } from "./session-store";

// ── Types ────────────────────────────────────────────────────────────

export interface RecentTurn {
  role: string;
  content: string;
  turnIndex: number;
  turnId: string;
}

export interface MemoryRetrievalStatus {
  factsOk: boolean;
  knowledgeGraphOk: boolean;
  recentTurnsOk: boolean;
  errors: string[];
}

export interface MemoryPacket {
  // From InterviewerState
  currentStep: string;
  introDone: boolean;
  currentTopic: string;
  askedQuestionIds: string[];
  followupQueue: FollowUpItem[];
  contradictions: Contradiction[];
  pendingClarifications: PendingClarification[];
  topicDepthCounters: Record<string, number>;
  stateHash: string;
  // From Tier 1 facts
  verifiedFacts: Array<{ factType: string; content: string; confidence: number }>;
  // From knowledge graph
  knowledgeGraph: Record<string, unknown> | null;
  // From canonical conversation ledger
  recentTurns: RecentTurn[];
  // From session state
  moduleScores: Array<{ module: string; score: number; reason: string }>;
  questionCount: number;
  currentDifficultyLevel: string;
  currentModule: string;
  candidateProfile: CandidateProfile | null;
  // Memory confidence scoring
  memoryConfidence: number; // 0.0–1.0 based on retrieval source success
  retrievalStatus: MemoryRetrievalStatus;
  // Context retrieval manifest
  manifest: ContextRetrievalManifest;
}

export interface ContextRetrievalManifest {
  turns: Array<{
    turnIndex: number;
    turnId: string;
    source: "milestone" | "unresolved" | "recent";
    tokenEstimate: number;
  }>;
  totalTokens: number;
  budgetUsed: number; // 0-1 fraction
  budgetTotal: number;
}

// ── Compose ──────────────────────────────────────────────────────────

/**
 * Unified 4-factor memory confidence score (0.0–1.0).
 * Used by both composeMemoryPacket and memory-status endpoint.
 *
 * Factors:
 *   1. Retrieval source health (+0.4)
 *   2. Session violation count (+0.3, decreasing with violations)
 *   3. Redis persistence confirmed (+0.2)
 *   4. Recovery quality (+0.1)
 *   Context penalty: -0.1 if below minimum token threshold
 */
export function compute4FactorConfidence(
  retrievalStatus: { factsOk: boolean; knowledgeGraphOk: boolean; recentTurnsOk: boolean },
  manifestTotalTokens: number,
  minTokenThreshold: number,
  violationCount: number,
  reconnectCount: number,
  hasStateHash: boolean,
): number {
  const healthyCount = [retrievalStatus.factsOk, retrievalStatus.knowledgeGraphOk, retrievalStatus.recentTurnsOk].filter(Boolean).length;
  let score = (healthyCount / 3) * 0.4;
  score += violationCount === 0 ? 0.3 : Math.max(0, 0.3 - violationCount * 0.1);
  score += 0.2; // Redis persistence confirmed (session was loaded)
  score += (reconnectCount === 0 || hasStateHash) ? 0.1 : 0.05;
  if (manifestTotalTokens < minTokenThreshold) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

/**
 * Compose a complete memory packet from all subsystems.
 * This is the single source of truth for what the interviewer "remembers."
 */
export async function composeMemoryPacket(
  interviewId: string,
  session: SessionState,
): Promise<MemoryPacket> {
  // 1. Deserialize InterviewerState (or use fresh defaults)
  let interviewerState: InterviewerState;
  try {
    interviewerState = session.interviewerState
      ? deserializeState(session.interviewerState)
      : createInitialState();
  } catch {
    interviewerState = createInitialState();
  }

  // Track retrieval success for confidence scoring
  const retrievalStatus: MemoryRetrievalStatus = {
    factsOk: false,
    knowledgeGraphOk: false,
    recentTurnsOk: false,
    errors: [],
  };

  // 2. Fetch verified facts from Tier 1
  let verifiedFacts: Array<{ factType: string; content: string; confidence: number }> = [];
  try {
    const { prisma } = await import("@/lib/prisma");
    const facts = await prisma.interviewFact.findMany({
      where: { interviewId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { factType: true, content: true, confidence: true },
    });
    // Deduplicate facts by content (case-insensitive key, keep highest confidence)
    const factMap = new Map<string, { factType: string; content: string; confidence: number }>();
    for (const f of facts) {
      const key = `${f.factType}:${f.content.toLowerCase().trim()}`;
      const existing = factMap.get(key);
      if (!existing || f.confidence > existing.confidence) {
        factMap.set(key, { factType: f.factType, content: f.content, confidence: f.confidence });
      }
    }
    verifiedFacts = Array.from(factMap.values());
    retrievalStatus.factsOk = true;
  } catch (err) {
    retrievalStatus.errors.push(`facts: ${(err as Error).message}`);
    try {
      const { recordSLOEvent } = await import("@/lib/slo-monitor");
      recordSLOEvent("memory.facts.retrieval_failure_rate", false).catch(() => {});
    } catch { /* slo import fail */ }
    const { isEnabled } = await import("@/lib/feature-flags");
    if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
      throw new Error(`Memory retrieval failed (facts): ${(err as Error).message}`);
    }
  }

  // 3. Fetch knowledge graph from Postgres
  let knowledgeGraph: Record<string, unknown> | null = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { knowledgeGraph: true },
    });
    knowledgeGraph = (interview?.knowledgeGraph as Record<string, unknown>) || null;
    retrievalStatus.knowledgeGraphOk = true;
  } catch (err) {
    retrievalStatus.errors.push(`knowledgeGraph: ${(err as Error).message}`);
    try {
      const { recordSLOEvent } = await import("@/lib/slo-monitor");
      recordSLOEvent("memory.kg.retrieval_failure_rate", false).catch(() => {});
    } catch { /* slo import fail */ }
    const { isEnabled } = await import("@/lib/feature-flags");
    if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
      throw new Error(`Memory retrieval failed (knowledgeGraph): ${(err as Error).message}`);
    }
  }

  // 4. Fetch recent turns from canonical conversation ledger (token-budgeted, three-tier)
  //    Tier A: Milestone turns (turn 0, state transitions, contradictions)
  //    Tier B: Unresolved contradiction/follow-up turns from InterviewerState
  //    Tier C: Recent chronological window fills remaining budget
  let recentTurns: RecentTurn[] = [];
  const CHARS_PER_TOKEN = 4;
  const MODEL_CONTEXT_TOKENS = parseInt(process.env.MEMORY_MODEL_CONTEXT_TOKENS || "1048576", 10);
  const MEMORY_BUDGET_RATIO = parseFloat(process.env.MEMORY_BUDGET_RATIO || "0.8");
  const TOKEN_BUDGET = Math.floor(MODEL_CONTEXT_TOKENS * MEMORY_BUDGET_RATIO);
  const MIN_TOKEN_THRESHOLD = parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10);
  const TOTAL_CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN;

  // Manifest tracking
  const manifestTurns: ContextRetrievalManifest["turns"] = [];
  try {
    const { getLedgerWindow } = await import("@/lib/conversation-ledger");
    const { prisma } = await import("@/lib/prisma");
    const lastTurnIndex = session.lastTurnIndex ?? -1;
    let usedCharBudget = 0;
    const includedTurnIndices = new Set<number>();

    // Tier A: Milestone turns (always include turn 0 + structurally important turns)
    const milestoneTurnIndices = new Set<number>([0]); // Always include opening
    try {
      const milestoneEvents = await prisma.interviewEvent.findMany({
        where: {
          interviewId,
          eventType: { in: ["state_transition", "contradiction_detected", "output_gate_blocked"] },
          turnIndex: { not: null },
        },
        select: { turnIndex: true },
        orderBy: { timestamp: "asc" },
        take: 20,
      });
      for (const e of milestoneEvents) {
        if (e.turnIndex !== null) milestoneTurnIndices.add(e.turnIndex);
      }
    } catch {
      // Non-fatal: milestone query failed, proceed with turn 0 only
    }

    // Tier B: Unresolved contradiction/follow-up turn IDs from InterviewerState
    const unresolvedTurnIds = new Set<string>();
    for (const c of interviewerState.contradictionMap) {
      if (c.turnIdA) unresolvedTurnIds.add(c.turnIdA);
      if (c.turnIdB) unresolvedTurnIds.add(c.turnIdB);
    }
    for (const p of interviewerState.pendingClarifications) {
      if (p.turnId) unresolvedTurnIds.add(p.turnId);
    }

    // Fetch priority turns (milestones + unresolved) by specific turnIndex
    if (milestoneTurnIndices.size > 0 || unresolvedTurnIds.size > 0) {
      try {
        const priorityRows = await prisma.interviewTranscript.findMany({
          where: {
            interviewId,
            OR: [
              ...(milestoneTurnIndices.size > 0
                ? [{ turnIndex: { in: Array.from(milestoneTurnIndices) } }]
                : []),
              ...(unresolvedTurnIds.size > 0
                ? [{ turnId: { in: Array.from(unresolvedTurnIds) } }]
                : []),
            ],
          },
          orderBy: { turnIndex: "asc" },
          take: 30,
        });
        for (const t of priorityRows) {
          const charLen = (t.content || "").length;
          if (usedCharBudget + charLen <= TOTAL_CHAR_BUDGET) {
            recentTurns.push({
              role: t.role,
              content: t.content,
              turnIndex: t.turnIndex,
              turnId: t.turnId,
            });
            const source: "milestone" | "unresolved" = milestoneTurnIndices.has(t.turnIndex) ? "milestone" : "unresolved";
            manifestTurns.push({
              turnIndex: t.turnIndex,
              turnId: t.turnId,
              source,
              tokenEstimate: Math.ceil(charLen / CHARS_PER_TOKEN),
            });
            usedCharBudget += charLen;
            includedTurnIndices.add(t.turnIndex);
          }
        }
      } catch {
        // Non-fatal: priority turns query failed, proceed with chronological window
      }
    }

    // Tier C: Recent chronological window fills remaining budget
    const remainingBudget = TOTAL_CHAR_BUDGET - usedCharBudget;
    if (remainingBudget > 0 && lastTurnIndex >= 0) {
      const windowStart = Math.max(0, lastTurnIndex - 39); // Expanded from 20 to 40
      const chronologicalTurns = await getLedgerWindow(interviewId, windowStart, 40, remainingBudget);
      for (const t of chronologicalTurns) {
        if (!includedTurnIndices.has(t.turnIndex)) {
          recentTurns.push({
            role: t.role,
            content: t.content,
            turnIndex: t.turnIndex,
            turnId: t.turnId,
          });
          manifestTurns.push({
            turnIndex: t.turnIndex,
            turnId: t.turnId,
            source: "recent",
            tokenEstimate: Math.ceil((t.content || "").length / CHARS_PER_TOKEN),
          });
          includedTurnIndices.add(t.turnIndex);
        }
      }
    }

    // Sort by turnIndex for chronological order
    recentTurns.sort((a, b) => a.turnIndex - b.turnIndex);
    retrievalStatus.recentTurnsOk = true;
  } catch (err) {
    retrievalStatus.errors.push(`recentTurns: ${(err as Error).message}`);
    try {
      const { recordSLOEvent } = await import("@/lib/slo-monitor");
      recordSLOEvent("memory.turns.retrieval_failure_rate", false).catch(() => {});
    } catch { /* slo import fail */ }
    const { isEnabled } = await import("@/lib/feature-flags");
    if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
      throw new Error(`Memory retrieval failed (recentTurns): ${(err as Error).message}`);
    }
  }

  // 5. Build context retrieval manifest
  const manifestTotalTokens = manifestTurns.reduce((sum, t) => sum + t.tokenEstimate, 0);
  const manifest: ContextRetrievalManifest = {
    turns: manifestTurns,
    totalTokens: manifestTotalTokens,
    budgetUsed: TOKEN_BUDGET > 0 ? manifestTotalTokens / TOKEN_BUDGET : 0,
    budgetTotal: TOKEN_BUDGET,
  };

  // LOW_CONTEXT_WARNING: fire when retrieved context is below minimum threshold
  if (manifestTotalTokens < MIN_TOKEN_THRESHOLD) {
    try {
      const { recordEvent } = await import("@/lib/interview-timeline");
      recordEvent(interviewId, "anomaly", {
        type: "LOW_CONTEXT_WARNING",
        totalTokens: manifestTotalTokens,
        threshold: MIN_TOKEN_THRESHOLD,
      }).catch(() => {});
    } catch { /* non-fatal */ }
  }

  // 6. Compute memory confidence score (0.0–1.0) using unified 4-factor model
  const memoryConfidence = compute4FactorConfidence(
    retrievalStatus,
    manifestTotalTokens,
    MIN_TOKEN_THRESHOLD,
    session.violationCount || 0,
    session.reconnectCount || 0,
    !!interviewerState.stateHash,
  );

  // 7. Compose unified packet
  return {
    // InterviewerState
    currentStep: interviewerState.currentStep,
    introDone: interviewerState.introDone,
    currentTopic: interviewerState.currentTopic,
    askedQuestionIds: interviewerState.askedQuestionIds,
    followupQueue: interviewerState.followupQueue,
    contradictions: interviewerState.contradictionMap,
    pendingClarifications: interviewerState.pendingClarifications,
    topicDepthCounters: interviewerState.topicDepthCounters,
    stateHash: interviewerState.stateHash,
    // Tier 1 facts
    verifiedFacts,
    // Knowledge graph
    knowledgeGraph,
    // Canonical conversation context
    recentTurns,
    // Session state
    moduleScores: session.moduleScores || [],
    questionCount: session.questionCount || 0,
    currentDifficultyLevel: session.currentDifficultyLevel || "mid",
    currentModule: session.currentModule || "",
    candidateProfile: session.candidateProfile || null,
    // Memory confidence scoring
    memoryConfidence,
    retrievalStatus,
    // Context retrieval manifest
    manifest,
  };
}

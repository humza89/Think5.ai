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
}

// ── Compose ──────────────────────────────────────────────────────────

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
  } catch {
    // Non-fatal: continue without facts
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
  } catch {
    // Non-fatal: continue without knowledge graph
  }

  // 4. Fetch recent turns from canonical conversation ledger
  let recentTurns: RecentTurn[] = [];
  try {
    const { getLedgerWindow } = await import("@/lib/conversation-ledger");
    const lastTurnIndex = session.lastTurnIndex ?? -1;
    const windowStart = Math.max(0, lastTurnIndex - 19); // Last 20 turns
    const turns = await getLedgerWindow(interviewId, windowStart, 20, 16000);
    recentTurns = turns.map((t) => ({
      role: t.role,
      content: t.content,
      turnIndex: t.turnIndex,
      turnId: t.turnId,
    }));
  } catch {
    // Non-fatal: continue without recent turns
  }

  // 5. Compose unified packet
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
  };
}

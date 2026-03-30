/**
 * Memory Orchestrator — Unified memory packet composition
 *
 * Composes a single deterministic memory packet from all subsystems:
 * - InterviewerState (deterministic state machine)
 * - Tier 1 facts (regex-extracted verified claims)
 * - Knowledge graph (LLM-extracted semantic memory)
 * - Session state (module scores, difficulty, profile)
 *
 * Eliminates fragmented multi-store memory assembly.
 * Called on reconnect and recovery to ensure complete context.
 */

import type { InterviewerState, FollowUpItem, Contradiction, PendingClarification } from "./interviewer-state";
import { createInitialState, deserializeState } from "./interviewer-state";
import type { SessionState, CandidateProfile } from "./session-store";

// ── Types ────────────────────────────────────────────────────────────

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
    verifiedFacts = facts.map((f: { factType: string; content: string; confidence: number }) => ({
      factType: f.factType,
      content: f.content,
      confidence: f.confidence,
    }));
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

  // 4. Compose unified packet
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
    // Session state
    moduleScores: session.moduleScores || [],
    questionCount: session.questionCount || 0,
    currentDifficultyLevel: session.currentDifficultyLevel || "mid",
    currentModule: session.currentModule || "",
    candidateProfile: session.candidateProfile || null,
  };
}

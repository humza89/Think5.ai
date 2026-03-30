/**
 * Memory Slot Validator — Pre-response memory validation
 *
 * Ensures that required memory "slots" are present and fresh before
 * the AI model generates a response. If critical slots are missing,
 * the response should include a clarification request rather than
 * hallucinating from incomplete context.
 *
 * Each interview step has a set of required and optional memory slots.
 * The validator checks the memory packet against these requirements.
 */

import type { InterviewStep } from "./interviewer-state";

// ── Types ────────────────────────────────────────────────────────────

export type MemorySlot =
  | "candidate_name"
  | "resume_facts"
  | "recent_turns"
  | "technical_skills"
  | "current_topic_context"
  | "behavioral_signals"
  | "knowledge_graph"
  | "module_scores"
  | "commitments"
  | "contradictions";

export interface SlotRequirement {
  slot: MemorySlot;
  required: boolean;
  description: string;
}

export interface SlotCheckResult {
  allPresent: boolean;
  filled: MemorySlot[];
  missing: MemorySlot[];
  warnings: string[];
}

// ── Slot Requirements Per Step ───────────────────────────────────────

const STEP_REQUIREMENTS: Record<InterviewStep, SlotRequirement[]> = {
  opening: [
    { slot: "candidate_name", required: false, description: "Candidate name for personalization" },
  ],
  candidate_intro: [
    { slot: "candidate_name", required: false, description: "Candidate name" },
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
  ],
  resume_deep_dive: [
    { slot: "resume_facts", required: true, description: "Candidate resume facts for deep-dive" },
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "current_topic_context", required: true, description: "Current topic being explored" },
  ],
  technical: [
    { slot: "technical_skills", required: true, description: "Technical skills from resume/conversation" },
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "current_topic_context", required: true, description: "Current technical topic" },
    { slot: "module_scores", required: false, description: "Scoring context for adaptive difficulty" },
  ],
  behavioral: [
    { slot: "behavioral_signals", required: false, description: "Behavioral signals from KG" },
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "current_topic_context", required: true, description: "Current behavioral topic" },
  ],
  domain: [
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "current_topic_context", required: true, description: "Domain topic" },
    { slot: "knowledge_graph", required: false, description: "Semantic knowledge graph" },
  ],
  candidate_questions: [
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "commitments", required: false, description: "Unfulfilled commitments to address" },
  ],
  closing: [
    { slot: "recent_turns", required: true, description: "Recent conversation context" },
    { slot: "module_scores", required: false, description: "Module scores for summary" },
    { slot: "commitments", required: false, description: "Unfulfilled commitments to wrap up" },
  ],
};

// ── Slot Checking ────────────────────────────────────────────────────

/**
 * Get the required memory slots for a given interview step.
 */
export function getRequiredMemorySlots(step: InterviewStep): SlotRequirement[] {
  return STEP_REQUIREMENTS[step] || [];
}

/**
 * Check if all required memory slots are filled for the given step.
 */
export function checkMemorySlots(
  step: InterviewStep,
  availableSlots: Record<MemorySlot, boolean>
): SlotCheckResult {
  const requirements = getRequiredMemorySlots(step);
  const filled: MemorySlot[] = [];
  const missing: MemorySlot[] = [];
  const warnings: string[] = [];

  for (const req of requirements) {
    if (availableSlots[req.slot]) {
      filled.push(req.slot);
    } else if (req.required) {
      missing.push(req.slot);
      warnings.push(`Required slot "${req.slot}" missing: ${req.description}`);
    } else {
      warnings.push(`Optional slot "${req.slot}" missing: ${req.description}`);
    }
  }

  return {
    allPresent: missing.length === 0,
    filled,
    missing,
    warnings,
  };
}

/**
 * Derive available slots from a memory packet.
 * Maps memory packet fields to slot presence booleans.
 */
export function deriveAvailableSlots(memoryPacket: {
  verifiedFacts: Array<{ factType: string; content: string }>;
  recentTurns: Array<{ content: string }>;
  knowledgeGraph: unknown;
  currentTopic: string;
  moduleScores: Array<{ module: string; score: number }>;
  commitments?: Array<{ fulfilled: boolean }>;
  contradictions?: Array<{ description: string }>;
  candidateProfile?: { strengths?: string[] } | null;
}): Record<MemorySlot, boolean> {
  const facts = memoryPacket.verifiedFacts || [];
  const hasTechFacts = facts.some((f) =>
    f.factType === "TECHNICAL_SKILL" || f.factType === "RESPONSIBILITY"
  );
  const hasResumeFacts = facts.some((f) =>
    f.factType === "COMPANY" || f.factType === "DATE" || f.factType === "RESPONSIBILITY"
  );

  return {
    candidate_name: !!(memoryPacket.candidateProfile),
    resume_facts: hasResumeFacts,
    recent_turns: (memoryPacket.recentTurns || []).length > 0,
    technical_skills: hasTechFacts,
    current_topic_context: !!(memoryPacket.currentTopic),
    behavioral_signals: !!(memoryPacket.knowledgeGraph),
    knowledge_graph: !!(memoryPacket.knowledgeGraph),
    module_scores: (memoryPacket.moduleScores || []).length > 0,
    commitments: (memoryPacket.commitments || []).length > 0,
    contradictions: (memoryPacket.contradictions || []).length > 0,
  };
}

/**
 * Interviewer State — Deterministic, persisted interview state machine
 *
 * Replaces prompt-only interview state with a structured, server-authoritative
 * state machine. Every state transition is deterministic and reproducible.
 *
 * State is persisted via InterviewerStateSnapshot in Postgres and cached
 * in Redis session state via stateHash for reconciliation.
 */

import { createHash } from "crypto";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────

export type InterviewStep =
  | "opening"
  | "candidate_intro"
  | "resume_deep_dive"
  | "technical"
  | "behavioral"
  | "domain"
  | "candidate_questions"
  | "closing";

export interface FollowUpItem {
  topic: string;
  reason: string;
  priority: "high" | "medium" | "low";
  turnId?: string;
}

export interface Contradiction {
  turnIdA: string;
  turnIdB: string;
  description: string;
}

export interface PendingClarification {
  turnId: string;
  question: string;
}

export interface Commitment {
  id: string;
  description: string;
  turnId: string;
  fulfilled: boolean;
}

export type PersonaMode = "interviewer" | "clarifier" | "closer";

export interface InterviewerState {
  introDone: boolean;
  currentTopic: string;
  currentStep: InterviewStep;
  followupQueue: FollowUpItem[];
  askedQuestionIds: string[];
  contradictionMap: Contradiction[];
  pendingClarifications: PendingClarification[];
  topicDepthCounters: Record<string, number>;
  commitments: Commitment[];
  revisitAllowList: string[];
  /** Once true (after first AI turn), persona cannot re-introduce */
  personaLocked: boolean;
  /** Constrains valid output types for the current phase */
  activePersonaMode: PersonaMode;
  /** Fix 8: Cryptographic proof that persona lock is authentic (HMAC-signed) */
  personaIdentityToken?: string;
  stateHash: string;
}

// ── State Events ─────────────────────────────────────────────────────

export type StateEvent =
  | { type: "INTRO_COMPLETED" }
  | { type: "MOVE_TO_STEP"; step: InterviewStep }
  | { type: "SET_TOPIC"; topic: string }
  | { type: "QUESTION_ASKED"; questionHash: string }
  | { type: "FOLLOW_UP_FLAGGED"; item: FollowUpItem }
  | { type: "FOLLOW_UP_CONSUMED"; topic: string }
  | { type: "CONTRADICTION_DETECTED"; contradiction: Contradiction }
  | { type: "CLARIFICATION_REQUESTED"; clarification: PendingClarification }
  | { type: "CLARIFICATION_RESOLVED"; turnId: string }
  | { type: "TOPIC_DEPTH_INCREMENT"; topic: string }
  | { type: "DIFFICULTY_ADJUSTED"; level: string }
  | { type: "COMMITMENT_MADE"; commitment: { id: string; description: string; turnId: string } }
  | { type: "COMMITMENT_FULFILLED"; commitmentId: string }
  | { type: "REVISIT_QUESTION"; questionHash: string }
  | { type: "PERSONA_LOCKED" }
  | { type: "SET_PERSONA_MODE"; mode: PersonaMode };

// ── Core Operations ──────────────────────────────────────────────────

/**
 * Create a fresh initial state for a new interview.
 */
export function createInitialState(): InterviewerState {
  const state: InterviewerState = {
    introDone: false,
    currentTopic: "",
    currentStep: "opening",
    followupQueue: [],
    askedQuestionIds: [],
    contradictionMap: [],
    pendingClarifications: [],
    topicDepthCounters: {},
    commitments: [],
    revisitAllowList: [],
    personaLocked: false,
    activePersonaMode: "interviewer",
    stateHash: "",
  };
  state.stateHash = computeStateHash(state);
  return state;
}

/**
 * Pure function: apply an event to produce a new state.
 * All transitions are deterministic — same state + event = same output.
 */
export function transitionState(
  current: InterviewerState,
  event: StateEvent
): InterviewerState {
  const next = { ...current };

  switch (event.type) {
    case "INTRO_COMPLETED":
      next.introDone = true;
      if (next.currentStep === "opening") {
        next.currentStep = "candidate_intro";
      }
      break;

    case "MOVE_TO_STEP": {
      // Validate topic transitions: reject backward transitions, allow forward
      const fromIdx = getStepIndex(current.currentStep);
      const toIdx = getStepIndex(event.step);
      if (toIdx < fromIdx) {
        // Backward transition rejected — keep current step
        logger.warn(`[InterviewerState] Rejected backward transition: ${current.currentStep} → ${event.step}`);
        break;
      }
      next.currentStep = event.step;
      break;
    }

    case "SET_TOPIC":
      next.currentTopic = event.topic;
      break;

    case "QUESTION_ASKED":
      if (!next.askedQuestionIds.includes(event.questionHash)) {
        next.askedQuestionIds = [...next.askedQuestionIds, event.questionHash];
      }
      break;

    case "FOLLOW_UP_FLAGGED":
      next.followupQueue = [...next.followupQueue, event.item];
      break;

    case "FOLLOW_UP_CONSUMED":
      next.followupQueue = next.followupQueue.filter(
        (f) => f.topic !== event.topic
      );
      break;

    case "CONTRADICTION_DETECTED":
      next.contradictionMap = [...next.contradictionMap, event.contradiction];
      break;

    case "CLARIFICATION_REQUESTED":
      next.pendingClarifications = [
        ...next.pendingClarifications,
        event.clarification,
      ];
      break;

    case "CLARIFICATION_RESOLVED":
      next.pendingClarifications = next.pendingClarifications.filter(
        (c) => c.turnId !== event.turnId
      );
      break;

    case "TOPIC_DEPTH_INCREMENT": {
      const currentDepth = next.topicDepthCounters[event.topic] || 0;
      const maxDepth = (event as { maxTopicDepth?: number }).maxTopicDepth || 3;
      next.topicDepthCounters = {
        ...next.topicDepthCounters,
        [event.topic]: Math.min(currentDepth + 1, maxDepth),
      };
      break;
    }

    case "DIFFICULTY_ADJUSTED":
      // Difficulty is tracked in session state, not interviewer state
      break;

    case "COMMITMENT_MADE":
      next.commitments = [...next.commitments, {
        id: event.commitment.id,
        description: event.commitment.description,
        turnId: event.commitment.turnId,
        fulfilled: false,
      }];
      break;

    case "COMMITMENT_FULFILLED":
      next.commitments = next.commitments.map((c) =>
        c.id === event.commitmentId ? { ...c, fulfilled: true } : c
      );
      break;

    case "REVISIT_QUESTION":
      if (!next.revisitAllowList.includes(event.questionHash)) {
        next.revisitAllowList = [...next.revisitAllowList, event.questionHash];
      }
      break;

    case "PERSONA_LOCKED":
      next.personaLocked = true;
      // Fix 8: Generate cryptographic persona identity token
      next.personaIdentityToken = createHash("sha256")
        .update(`${current.stateHash}:persona_locked:${Date.now()}:${process.env.SESSION_HMAC_SECRET || "dev"}`)
        .digest("hex").slice(0, 32);
      break;

    case "SET_PERSONA_MODE":
      next.activePersonaMode = event.mode;
      break;
  }

  next.stateHash = computeStateHash(next);
  return next;
}

// ── Utilities ────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of the interviewer state.
 * Used for reconciliation on reconnect — same state = same hash.
 */
export function computeStateHash(state: InterviewerState): string {
  // Exclude stateHash and personaIdentityToken from the computation
  // stateHash: avoid circular dependency
  // personaIdentityToken: depends on timestamp, would break determinism
  const { stateHash: _, personaIdentityToken: _pit, ...rest } = state;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Hash a question text to produce a dedup ID.
 * Normalizes whitespace, case, and punctuation before hashing.
 */
export function hashQuestion(questionText: string): string {
  const normalized = questionText
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Serialize state to JSON string for storage.
 */
export function serializeState(state: InterviewerState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize JSON string back to InterviewerState.
 * Validates all fields to prevent corrupted state from propagating.
 */
export function deserializeState(json: string): InterviewerState {
  const parsed = JSON.parse(json);

  // Validate all required fields with strict type checks
  if (typeof parsed.introDone !== "boolean") {
    throw new Error("Invalid interviewer state: introDone must be boolean");
  }
  if (typeof parsed.currentStep !== "string" || !STEP_ORDER.includes(parsed.currentStep as InterviewStep)) {
    throw new Error(`Invalid interviewer state: currentStep "${parsed.currentStep}" is not a valid step`);
  }
  if (typeof parsed.currentTopic !== "string") {
    throw new Error("Invalid interviewer state: currentTopic must be string");
  }
  if (!Array.isArray(parsed.askedQuestionIds) || !parsed.askedQuestionIds.every((id: unknown) => typeof id === "string")) {
    throw new Error("Invalid interviewer state: askedQuestionIds must be string[]");
  }
  if (!Array.isArray(parsed.followupQueue)) {
    throw new Error("Invalid interviewer state: followupQueue must be array");
  }
  if (!Array.isArray(parsed.contradictionMap)) {
    throw new Error("Invalid interviewer state: contradictionMap must be array");
  }
  if (!Array.isArray(parsed.pendingClarifications)) {
    throw new Error("Invalid interviewer state: pendingClarifications must be array");
  }
  if (typeof parsed.topicDepthCounters !== "object" || parsed.topicDepthCounters === null || Array.isArray(parsed.topicDepthCounters)) {
    throw new Error("Invalid interviewer state: topicDepthCounters must be object");
  }
  if (!Array.isArray(parsed.commitments)) {
    throw new Error("Invalid interviewer state: commitments must be array");
  }
  if (!Array.isArray(parsed.revisitAllowList)) {
    throw new Error("Invalid interviewer state: revisitAllowList must be array");
  }
  if (typeof parsed.stateHash !== "string") {
    throw new Error("Invalid interviewer state: stateHash must be string");
  }

  // Backward-compatible defaults for new persona fields
  if (typeof parsed.personaLocked !== "boolean") {
    parsed.personaLocked = parsed.introDone === true;
  }
  if (!parsed.activePersonaMode || !["interviewer", "clarifier", "closer"].includes(parsed.activePersonaMode)) {
    parsed.activePersonaMode = parsed.currentStep === "closing" ? "closer" : "interviewer";
  }

  return parsed as InterviewerState;
}

/**
 * Check if a question has already been asked (dedup).
 */
export function isQuestionAsked(
  state: InterviewerState,
  questionText: string
): boolean {
  return state.askedQuestionIds.includes(hashQuestion(questionText));
}

/**
 * Get the next follow-up item by priority (high > medium > low).
 */
export function getNextFollowUp(
  state: InterviewerState
): FollowUpItem | null {
  const priorityOrder: FollowUpItem["priority"][] = ["high", "medium", "low"];
  for (const priority of priorityOrder) {
    const item = state.followupQueue.find((f) => f.priority === priority);
    if (item) return item;
  }
  return null;
}

/**
 * Check if a topic has reached max follow-up depth (3).
 */
export function isTopicExhausted(
  state: InterviewerState,
  topic: string
): boolean {
  return (state.topicDepthCounters[topic] || 0) >= 3;
}

/**
 * Valid step transitions map. Each step lists which steps can follow it.
 * Forward skips are allowed; backward transitions are rejected.
 */
export const VALID_STEP_TRANSITIONS: Record<InterviewStep, InterviewStep[]> = {
  opening: ["candidate_intro"],
  candidate_intro: ["resume_deep_dive"],
  resume_deep_dive: ["technical", "behavioral", "domain"],
  technical: ["behavioral", "domain", "candidate_questions"],
  behavioral: ["domain", "candidate_questions"],
  domain: ["candidate_questions"],
  candidate_questions: ["closing"],
  closing: [], // terminal
};

/**
 * Standard step progression order for validation.
 */
const STEP_ORDER: InterviewStep[] = [
  "opening",
  "candidate_intro",
  "resume_deep_dive",
  "technical",
  "behavioral",
  "domain",
  "candidate_questions",
  "closing",
];

/**
 * Get the index of a step in the standard progression.
 */
export function getStepIndex(step: InterviewStep): number {
  return STEP_ORDER.indexOf(step);
}

/**
 * Check if transitioning from one step to another skips any steps.
 */
export function isStepSkip(from: InterviewStep, to: InterviewStep): boolean {
  const fromIdx = getStepIndex(from);
  const toIdx = getStepIndex(to);
  return toIdx - fromIdx > 1;
}

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

export interface InterviewerState {
  introDone: boolean;
  currentTopic: string;
  currentStep: InterviewStep;
  followupQueue: FollowUpItem[];
  askedQuestionIds: string[];
  contradictionMap: Contradiction[];
  pendingClarifications: PendingClarification[];
  topicDepthCounters: Record<string, number>;
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
  | { type: "DIFFICULTY_ADJUSTED"; level: string };

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

    case "MOVE_TO_STEP":
      next.currentStep = event.step;
      break;

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
      next.topicDepthCounters = {
        ...next.topicDepthCounters,
        [event.topic]: Math.min(currentDepth + 1, 3), // Max 3 follow-ups per topic
      };
      break;
    }

    case "DIFFICULTY_ADJUSTED":
      // Difficulty is tracked in session state, not interviewer state
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
  // Exclude stateHash itself from the computation to avoid circular dependency
  const { stateHash: _, ...rest } = state;
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
 */
export function deserializeState(json: string): InterviewerState {
  const parsed = JSON.parse(json);
  // Validate required fields
  if (typeof parsed.introDone !== "boolean" || typeof parsed.currentStep !== "string") {
    throw new Error("Invalid interviewer state: missing required fields");
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

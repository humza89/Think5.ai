/**
 * Session Brain — Server-side session orchestration core
 *
 * Receives finalized turns and applies server-side logic before acknowledging:
 * - Runs output gate + grounding gate
 * - Applies state machine transitions
 * - Commits to canonical ledger atomically
 * - Enforces continuity contract (context checksum)
 * - Validates memory slots before AI turns
 *
 * This is the "session brain" that moves orchestration authority from
 * the client to the server, one turn at a time.
 */

import { createHash } from "crypto";
import type { InterviewerState } from "./interviewer-state";
import { transitionState, computeStateHash, deserializeState, serializeState, createInitialState } from "./interviewer-state";
import { commitSingleTurn } from "./conversation-ledger";
import type { LedgerTurn } from "./conversation-ledger";
import { checkOutputGateWithAction } from "./output-gate";
import type { GateViolation } from "./output-gate";
import { checkFollowUpGrounding } from "./grounding-gate";
import { isEnabled } from "./feature-flags";
import { detectContradictions } from "./semantic-contradiction-detector";
import { compute4FactorConfidence } from "./memory-orchestrator";
import { recordSLOEvent } from "./slo-monitor";

// ── Types ────────────────────────────────────────────────────────────

export interface TurnCommitRequest {
  turnId: string;
  role: "model" | "user" | "interviewer" | "candidate";
  content: string;
  causalParentTurnId?: string;
  clientTimestamp?: string;
  contextChecksum?: string;
}

export interface TurnCommitResult {
  committed: boolean;
  turnIndex?: number;
  stateHash: string;
  contextChecksum: string;
  violations: GateViolation[];
  corrections?: string;
  reason?: string;
  memorySlotWarnings?: string[];
}

export interface ContinuityContract {
  contextChecksum: string;
  issuedAt: number;
  ledgerVersion: number;
  stateHash: string;
}

// ── Context Checksum ─────────────────────────────────────────────────

/**
 * Compute a deterministic context checksum from session state.
 * Used to enforce the hard continuity contract: no generation
 * permitted unless client's checksum matches server's.
 */
export function computeContextChecksum(
  stateHash: string,
  ledgerVersion: number,
  factCount: number
): string {
  return createHash("sha256")
    .update(`${stateHash}:${ledgerVersion}:${factCount}`)
    .digest("hex")
    .slice(0, 16);
}

// ── Turn Commit ──────────────────────────────────────────────────────

/**
 * Process and commit a single turn with full server-side validation.
 *
 * 1. Verify continuity contract (context checksum)
 * 2. Run output gate (for AI turns)
 * 3. Run grounding gate (for AI turns referencing candidate facts)
 * 4. Commit to canonical ledger with version assertion
 * 5. Apply state machine transitions
 * 6. Return new state hash + context checksum
 */
export async function commitTurn(
  interviewId: string,
  request: TurnCommitRequest,
  sessionState: {
    interviewerState?: string;
    lastTurnIndex: number;
    verifiedFacts?: Array<{ factType: string; content: string; confidence: number }>;
    recentTurns?: Array<{ turnId: string; content: string }>;
    contextChecksum?: string;
    factCount?: number;
    lastFactRefreshAt?: string;
  }
): Promise<TurnCommitResult> {
  const violations: GateViolation[] = [];
  const memorySlotWarnings: string[] = [];

  // 1. Deserialize interviewer state
  let interviewerState: InterviewerState;
  try {
    interviewerState = sessionState.interviewerState
      ? deserializeState(sessionState.interviewerState)
      : createInitialState();
  } catch {
    interviewerState = createInitialState();
  }

  // 2. Verify continuity contract (if enabled and checksum provided)
  if (
    isEnabled("TURN_COMMIT_PROTOCOL") &&
    request.contextChecksum &&
    sessionState.contextChecksum
  ) {
    if (request.contextChecksum !== sessionState.contextChecksum) {
      return {
        committed: false,
        stateHash: interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum,
        violations: [],
        reason: "CONTEXT_STALE",
      };
    }
  }

  // 3. Run output gate for AI turns (blocking when FF_OUTPUT_GATE_BLOCKING enabled)
  const isAITurn = request.role === "model" || request.role === "interviewer";
  if (isAITurn) {
    const blockingEnabled = isEnabled("OUTPUT_GATE_BLOCKING");
    const gateAction = checkOutputGateWithAction(request.content, {
      introDone: interviewerState.introDone,
      askedQuestionIds: interviewerState.askedQuestionIds,
      verifiedFacts: sessionState.verifiedFacts || [],
      personaLocked: interviewerState.personaLocked,
      currentStep: interviewerState.currentStep,
    }, blockingEnabled);

    if (gateAction.action === "block") {
      return {
        committed: false,
        stateHash: interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum || "",
        violations: gateAction.violations,
        corrections: gateAction.sanitizedResponse,
        reason: "OUTPUT_GATE_BLOCKED",
      };
    }

    if (gateAction.violations.length > 0) {
      violations.push(...gateAction.violations);
    }

    // 4. Run grounding gate for AI turns that reference candidate statements
    if (sessionState.recentTurns && sessionState.recentTurns.length > 0) {
      const groundingResult = checkFollowUpGrounding(
        request.content,
        sessionState.recentTurns,
        (sessionState.verifiedFacts || []).map((f) => ({
          content: f.content,
          factType: f.factType,
        }))
      );
      if (!groundingResult.grounded && groundingResult.flag) {
        const groundingSeverity = blockingEnabled ? "block" : "warn";
        violations.push({
          type: "unsupported_claim",
          detail: `Ungrounded follow-up: ${groundingResult.flag}`,
          severity: groundingSeverity,
        });
        // When blocking is enabled, reject the turn for ungrounded claims
        if (blockingEnabled) {
          return {
            committed: false,
            stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "",
            violations,
            reason: "GROUNDING_GATE_BLOCKED",
          };
        }
      }
    }
  }

  // 4b. Contradiction gate: detect contradictions between new content and verified facts
  if (isAITurn && isEnabled("SEMANTIC_CONTRADICTION_DETECTOR") && sessionState.verifiedFacts?.length) {
    const contradictionStart = Date.now();
    try {
      const CONTRADICTION_TIMEOUT_MS = 500;
      const newFact = { turnId: request.turnId, content: request.content, factType: "CLAIM" as const, confidence: 0.8, extractedBy: "session-brain" };
      const existingFacts = sessionState.verifiedFacts.map((f) => ({
        turnId: "prior", content: f.content, factType: f.factType as any, confidence: f.confidence, extractedBy: "checkpoint",
      }));
      const contradictions = detectContradictions(newFact, existingFacts);
      const contradictionMs = Date.now() - contradictionStart;
      if (contradictionMs > CONTRADICTION_TIMEOUT_MS) {
        console.warn(`[SessionBrain] Contradiction detection slow: ${contradictionMs}ms (threshold: ${CONTRADICTION_TIMEOUT_MS}ms)`);
      }
      recordSLOEvent("memory.contradiction.detection_rate", true).catch(() => {});
      for (const c of contradictions) {
        violations.push({
          type: "unsupported_claim",
          detail: `Contradiction detected (${c.type}): ${c.description}`,
          severity: "warn",
        });
      }
    } catch (err) {
      const contradictionMs = Date.now() - contradictionStart;
      console.warn(`[SessionBrain] Contradiction detection failed after ${contradictionMs}ms:`, err);
      recordSLOEvent("memory.contradiction.detection_rate", false).catch(() => {});
    }
  }

  // 4c. Memory confidence gate: warn when confidence is critically low
  if (isAITurn && isEnabled("TURN_COMMIT_PROTOCOL")) {
    try {
      // Estimate token count from actual content length (chars / 4 approximation)
      const estimatedTokens = sessionState.recentTurns?.reduce(
        (sum, t) => sum + Math.ceil(t.content.length / 4), 0
      ) ?? 0;
      const confidence = compute4FactorConfidence(
        {
          factsOk: (sessionState.verifiedFacts?.length ?? 0) > 0,
          knowledgeGraphOk: false, // Conservative: unknown KG state at commit time
          recentTurnsOk: (sessionState.recentTurns?.length ?? 0) > 0,
        },
        estimatedTokens,
        parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10),
        0, 0, !!interviewerState.stateHash
      );
      if (confidence < 0.3) {
        memorySlotWarnings.push(`LOW_MEMORY_CONFIDENCE: ${confidence.toFixed(2)} — asking for clarification instead`);
        recordSLOEvent("memory.confidence.adequate_rate", false).catch(() => {});
      } else {
        recordSLOEvent("memory.confidence.adequate_rate", true).catch(() => {});
      }
    } catch { /* Non-fatal */ }
  }

  // 4d. Memory freshness SLA: warn when facts are stale
  if (isAITurn && sessionState.lastFactRefreshAt) {
    const FACT_FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const staleness = Date.now() - new Date(sessionState.lastFactRefreshAt).getTime();
    if (staleness > FACT_FRESHNESS_THRESHOLD_MS) {
      memorySlotWarnings.push(`STALE_FACTS: Facts last refreshed ${Math.round(staleness / 1000)}s ago`);
      recordSLOEvent("memory.facts.freshness_rate", false).catch(() => {});
    } else {
      recordSLOEvent("memory.facts.freshness_rate", true).catch(() => {});
    }
  }

  // 5. Commit to canonical ledger with version assertion
  const ledgerTurn: LedgerTurn = {
    role: request.role === "model" ? "interviewer" : request.role === "user" ? "candidate" : request.role,
    content: request.content,
    timestamp: request.clientTimestamp || new Date().toISOString(),
    turnId: request.turnId,
    causalParentTurnId: request.causalParentTurnId,
    clientTimestamp: request.clientTimestamp,
    finalized: false,
  };

  const commitResult = await commitSingleTurn(
    interviewId,
    ledgerTurn,
    sessionState.lastTurnIndex
  );

  if (!commitResult.committed) {
    return {
      committed: false,
      stateHash: interviewerState.stateHash,
      contextChecksum: sessionState.contextChecksum || "",
      violations,
      reason: commitResult.reason,
    };
  }

  // 6. Apply state machine transitions
  if (isAITurn && !interviewerState.personaLocked) {
    interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
  }

  if (isAITurn && !interviewerState.introDone && interviewerState.currentStep === "opening") {
    interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
  }

  // 7. Compute new context checksum
  const newChecksum = computeContextChecksum(
    interviewerState.stateHash,
    commitResult.currentVersion ?? sessionState.lastTurnIndex + 1,
    sessionState.factCount ?? 0
  );

  return {
    committed: true,
    turnIndex: commitResult.turn?.turnIndex,
    stateHash: interviewerState.stateHash,
    contextChecksum: newChecksum,
    violations,
    memorySlotWarnings,
    corrections: violations.length > 0
      ? `${violations.length} violation(s) detected but turn committed (warn mode)`
      : undefined,
  };
}

/**
 * Get the serialized interviewer state after a commit.
 * Useful for updating session state in Redis after turn-commit.
 */
export function getUpdatedStateJson(
  currentStateJson: string | undefined,
  events: Array<{ type: string; [key: string]: unknown }>
): string {
  let state: InterviewerState;
  try {
    state = currentStateJson ? deserializeState(currentStateJson) : createInitialState();
  } catch {
    state = createInitialState();
  }

  for (const event of events) {
    try {
      state = transitionState(state, event as any);
    } catch {
      // Skip invalid events
    }
  }

  return serializeState(state);
}

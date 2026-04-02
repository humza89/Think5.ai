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
import { Prisma } from "@prisma/client";
import type { InterviewerState } from "./interviewer-state";
import { transitionState, computeStateHash, deserializeState, serializeState, createInitialState } from "./interviewer-state";
import { commitSingleTurn } from "./conversation-ledger";
import type { LedgerTurn } from "./conversation-ledger";
import { checkOutputGateWithAction, INTRO_PATTERNS } from "./output-gate";
import type { GateViolation } from "./output-gate";
import { checkFollowUpGrounding, verifyGrounding, detectHallucinatedReferences } from "./grounding-gate";
import { isEnabled } from "./feature-flags";
import { detectContradictions } from "./semantic-contradiction-detector";
import { compute4FactorConfidence } from "./memory-orchestrator";
import { recordSLOEvent, enforceSessionSLO } from "./slo-monitor";
import { recordEvent } from "./interview-timeline";
import { extractFactsImmediate } from "./fact-extractor";

// ── Types ────────────────────────────────────────────────────────────

export interface TurnCommitRequest {
  turnId: string;
  role: "model" | "user" | "interviewer" | "candidate";
  content: string;
  causalParentTurnId?: string;
  clientTimestamp?: string;
  contextChecksum?: string;
  /** N9: Client-assigned monotonic sequence number (starts at 0) */
  sequenceNumber?: number;
  /** N8: Grounding references — which candidate turns ground this question */
  sourceTurnIds?: string[];
  /** N4: Chunk ID for turn fragment tracking */
  chunkId?: string;
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
  interviewerState?: string;
  ledgerVersion?: number;
  /** Regeneration guidance when blocked by contradiction detector — tells caller how to correct */
  regenerationPrompt?: string;
  /** N3: Hold signal when memory confidence is degraded (0.3-0.65) */
  holdSignal?: { action: string; retryAfterMs: number; recoverySyncRequired: boolean };
  /** N5: Per-turn memory integrity checksum */
  memoryChecksum?: string;
  /** N9: Expected next sequence number (for resync on rejection) */
  expectedSequenceNumber?: number;
}

export interface ContinuityContract {
  contextChecksum: string;
  issuedAt: number;
  ledgerVersion: number;
  stateHash: string;
}

/** Session state parameter shared across commit functions */
export type CommitSessionState = {
  interviewerState?: string;
  lastTurnIndex: number;
  verifiedFacts?: Array<{ factType: string; content: string; confidence: number }>;
  recentTurns?: Array<{ turnId: string; content: string }>;
  contextChecksum?: string;
  factCount?: number;
  lastFactRefreshAt?: string;
  lastSequenceNumber?: number;
  lastMemoryChecksum?: string;
  lastExtractionTurnIndex?: number;
};

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

// ── Validation Gates (Read-Only) ─────────────────────────────────────

/** Result of running all validation gates (read-only checks) */
interface ValidationGateResult {
  passed: boolean;
  rejectionResult?: TurnCommitResult;
  interviewerState: InterviewerState;
  violations: GateViolation[];
  memorySlotWarnings: string[];
}

/**
 * Run all read-only validation gates without performing any writes.
 * Shared by both commitTurn (non-atomic) and atomicTurnCommit (atomic).
 */
async function runValidationGates(
  interviewId: string,
  request: TurnCommitRequest,
  sessionState: CommitSessionState
): Promise<ValidationGateResult> {
  const violations: GateViolation[] = [];
  const memorySlotWarnings: string[] = [];

  // 0. SLO enforcement hard gate — block session if critical SLOs breached
  try {
    const sloCheck = await enforceSessionSLO(interviewId);
    if (sloCheck.blocked) {
      return {
        passed: false,
        rejectionResult: { committed: false, stateHash: "", contextChecksum: "", violations: [], reason: sloCheck.reason },
        interviewerState: createInitialState(),
        violations: [],
        memorySlotWarnings: [],
      };
    }
  } catch { /* SLO enforcement failure is non-fatal */ }

  // 0b. N9: Strict sequence number enforcement
  if (isEnabled("STRICT_SEQUENCE_NUMBERS") && request.sequenceNumber !== undefined) {
    const expectedSeq = (sessionState.lastSequenceNumber ?? -1) + 1;
    if (request.sequenceNumber < expectedSeq) {
      return {
        passed: false,
        rejectionResult: { committed: false, stateHash: "", contextChecksum: "", violations: [], reason: "DUPLICATE_SEQUENCE", expectedSequenceNumber: expectedSeq },
        interviewerState: createInitialState(),
        violations: [],
        memorySlotWarnings: [],
      };
    }
    if (request.sequenceNumber > expectedSeq) {
      return {
        passed: false,
        rejectionResult: { committed: false, stateHash: "", contextChecksum: "", violations: [], reason: "OUT_OF_ORDER_SEQUENCE", expectedSequenceNumber: expectedSeq },
        interviewerState: createInitialState(),
        violations: [],
        memorySlotWarnings: [],
      };
    }
  }

  // 0c. N8: Enterprise source grounding — require sourceTurnIds on AI question turns
  const isAIRole = request.role === "model" || request.role === "interviewer";
  if (isAIRole && isEnabled("ENTERPRISE_SOURCE_GROUNDING_REQUIRED")) {
    if (!request.sourceTurnIds || request.sourceTurnIds.length === 0) {
      return {
        passed: false,
        rejectionResult: {
          committed: false, stateHash: "", contextChecksum: "", violations: [],
          reason: "SOURCE_GROUNDING_REQUIRED",
          memorySlotWarnings: ["N8: AI turn missing required sourceTurnIds (enterprise mode)"],
        },
        interviewerState: createInitialState(),
        violations: [],
        memorySlotWarnings: ["N8: AI turn missing required sourceTurnIds (enterprise mode)"],
      };
    }
  }

  // 1. Deserialize interviewer state
  let interviewerState: InterviewerState;
  try {
    interviewerState = sessionState.interviewerState
      ? deserializeState(sessionState.interviewerState)
      : createInitialState();
  } catch {
    interviewerState = createInitialState();
  }

  // 1b. Fix 8: Persona identity token verification
  if (isEnabled("PERSONA_IDENTITY_TOKEN") && interviewerState.personaLocked && !interviewerState.personaIdentityToken) {
    return {
      passed: false,
      rejectionResult: {
        committed: false, stateHash: interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum || "", violations: [],
        reason: "PERSONA_INTEGRITY_VIOLATION",
        memorySlotWarnings: ["Fix 8: Persona claims locked but has no identity token"],
      },
      interviewerState, violations: [], memorySlotWarnings: ["PERSONA_INTEGRITY_VIOLATION"],
    };
  }

  // 2. Verify continuity contract (if enabled and checksum provided)
  if (
    isEnabled("TURN_COMMIT_PROTOCOL") &&
    request.contextChecksum &&
    sessionState.contextChecksum
  ) {
    if (request.contextChecksum !== sessionState.contextChecksum) {
      return {
        passed: false,
        rejectionResult: { committed: false, stateHash: interviewerState.stateHash, contextChecksum: sessionState.contextChecksum, violations: [], reason: "CONTEXT_STALE" },
        interviewerState,
        violations: [],
        memorySlotWarnings: [],
      };
    }
  }

  // 3. Run output gate for AI turns (blocking when FF_OUTPUT_GATE_BLOCKING enabled)
  const isAITurn = request.role === "model" || request.role === "interviewer";

  // AF6/AF7: Compute memory confidence BEFORE grounding gates so it can escalate severity
  let memoryConfidence = 1.0;
  if (isAITurn && isEnabled("TURN_COMMIT_PROTOCOL")) {
    try {
      const estimatedTokens = sessionState.recentTurns?.reduce(
        (sum, t) => sum + Math.ceil(t.content.length / 4), 0
      ) ?? 0;
      memoryConfidence = compute4FactorConfidence(
        {
          factsOk: (sessionState.verifiedFacts?.length ?? 0) > 0,
          knowledgeGraphOk: false,
          recentTurnsOk: (sessionState.recentTurns?.length ?? 0) > 0,
        },
        estimatedTokens,
        parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10),
        0, 0, !!interviewerState.stateHash
      );
      if (memoryConfidence < 0.3) {
        memorySlotWarnings.push(`LOW_MEMORY_CONFIDENCE: ${memoryConfidence.toFixed(2)} — asking for clarification instead`);
        recordSLOEvent("memory.confidence.adequate_rate", false).catch(() => {});
        return {
          passed: false,
          rejectionResult: {
            committed: false, stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "", violations: [],
            reason: "MEMORY_CONFIDENCE_LOW", memorySlotWarnings: [...memorySlotWarnings],
          },
          interviewerState, violations, memorySlotWarnings,
        };
      }
      // N3: Enterprise memory pause — degraded but not critically low (0.3 ≤ confidence < 0.65)
      else if (memoryConfidence < 0.65 && isEnabled("ENTERPRISE_MEMORY_HARD_PAUSE")) {
        memorySlotWarnings.push(`ENTERPRISE_PAUSE: confidence=${memoryConfidence.toFixed(2)} < 0.65`);

        // N3: Attempt server-side memory recovery before sending holdSignal
        let recovered = false;
        try {
          recordEvent(interviewId, "memory_recovery_in_progress", { confidence: memoryConfidence }).catch(() => {});

          const { prisma } = await import("@/lib/prisma");
          // Re-fetch canonical facts from Postgres
          const freshFacts = await prisma.interviewFact.findMany({
            where: { interviewId },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { factType: true, content: true, confidence: true },
          });
          // Re-fetch latest state snapshot
          const freshSnapshot = await prisma.interviewerStateSnapshot.findFirst({
            where: { interviewId },
            orderBy: { turnIndex: "desc" },
            select: { stateHash: true },
          });

          // Recompute confidence with fresh data
          const recoveredConfidence = compute4FactorConfidence(
            {
              factsOk: freshFacts.length > 0,
              knowledgeGraphOk: false,
              recentTurnsOk: (sessionState.recentTurns?.length ?? 0) > 0,
            },
            sessionState.recentTurns?.reduce((sum, t) => sum + Math.ceil(t.content.length / 4), 0) ?? 0,
            parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10),
            0, 0, !!freshSnapshot?.stateHash
          );

          if (recoveredConfidence >= 0.65) {
            memoryConfidence = recoveredConfidence;
            recovered = true;
            memorySlotWarnings.push(`MEMORY_RECOVERED: confidence=${recoveredConfidence.toFixed(2)} after re-fetch`);
            recordEvent(interviewId, "memory_recovered", {
              previousConfidence: memoryConfidence,
              recoveredConfidence,
            }).catch(() => {});
            recordSLOEvent("memory.confidence.adequate_rate", true).catch(() => {});
          }
        } catch {
          // Recovery failed — proceed with holdSignal (fail-closed)
        }

        if (!recovered) {
          recordSLOEvent("memory.confidence.adequate_rate", false).catch(() => {});
          return {
            passed: false,
            rejectionResult: {
              committed: false, stateHash: interviewerState.stateHash,
              contextChecksum: sessionState.contextChecksum || "", violations: [],
              reason: "MEMORY_CONFIDENCE_DEGRADED",
              holdSignal: { action: "HOLD_AND_RETRY", retryAfterMs: 2000, recoverySyncRequired: true },
              memorySlotWarnings: [...memorySlotWarnings],
            },
            interviewerState, violations, memorySlotWarnings,
          };
        }
        // If recovered, fall through to normal gate processing
      } else {
        recordSLOEvent("memory.confidence.adequate_rate", true).catch(() => {});
      }
    } catch (err) {
      // FIX-5: Fail-closed — computation error → confidence=0.0 → hard block
      console.error("[SessionBrain] Memory confidence computation failed:", err);
      memoryConfidence = 0.0;
      return {
        passed: false,
        rejectionResult: {
          committed: false, stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "", violations: [],
          reason: "MEMORY_CONFIDENCE_LOW",
          memorySlotWarnings: ["HARD_BLOCK: confidence computation failed — fail-closed"],
        },
        interviewerState, violations, memorySlotWarnings,
      };
    }
  }

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
        passed: false,
        rejectionResult: {
          committed: false, stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: gateAction.violations, corrections: gateAction.sanitizedResponse,
          reason: "OUTPUT_GATE_BLOCKED",
        },
        interviewerState, violations: gateAction.violations, memorySlotWarnings,
      };
    }

    if (gateAction.violations.length > 0) {
      violations.push(...gateAction.violations);
    }

    // 3b. Unconditional intro guard — NOT flag-gated (CF2: architectural guarantee)
    if (interviewerState.personaLocked) {
      const hasIntro = INTRO_PATTERNS.some(p => p.test(request.content));
      if (hasIntro) {
        return {
          passed: false,
          rejectionResult: {
            committed: false, stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "",
            violations: [{ type: "reintroduction", detail: "Unconditional intro block: persona locked", severity: "block" }],
            reason: "INTRO_BLOCKED_UNCONDITIONAL",
          },
          interviewerState, violations, memorySlotWarnings,
        };
      }
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
        // AF7: Escalate to blocking when memory confidence is critically low
        const groundingSeverity = (blockingEnabled || memoryConfidence < 0.3) ? "block" : "warn";
        violations.push({
          type: "unsupported_claim",
          detail: `Ungrounded follow-up: ${groundingResult.flag}`,
          severity: groundingSeverity,
        });
        // When blocking is enabled or memory confidence is low, reject the turn
        if (blockingEnabled || memoryConfidence < 0.3) {
          return {
            passed: false,
            rejectionResult: {
              committed: false, stateHash: interviewerState.stateHash,
              contextChecksum: sessionState.contextChecksum || "",
              violations, reason: "GROUNDING_GATE_BLOCKED",
            },
            interviewerState, violations, memorySlotWarnings,
          };
        }
      }
    }

    // 4a. CF3: Full grounding verification for all AI claims (broader than follow-up check)
    if (isEnabled("GROUNDING_GATE_ENABLED") && sessionState.verifiedFacts?.length) {
      const groundingScore = verifyGrounding(
        request.content,
        sessionState.verifiedFacts.map((f) => ({
          turnId: "prior", content: f.content, factType: f.factType as any, confidence: f.confidence, extractedBy: "checkpoint",
        }))
      );
      if (!groundingScore.grounded && groundingScore.unsupportedClaims.length > 0) {
        // AF7: Escalate to blocking when memory confidence is critically low
        const severity = (blockingEnabled || memoryConfidence < 0.3) ? "block" : "warn";
        for (const claim of groundingScore.unsupportedClaims) {
          violations.push({ type: "unsupported_claim", detail: `Ungrounded claim: ${claim}`, severity });
        }
        if ((blockingEnabled || memoryConfidence < 0.3) && groundingScore.score < 0.5) {
          return {
            passed: false,
            rejectionResult: {
              committed: false, stateHash: interviewerState.stateHash,
              contextChecksum: sessionState.contextChecksum || "",
              violations, reason: "GROUNDING_GATE_BLOCKED",
            },
            interviewerState, violations, memorySlotWarnings,
          };
        }
      }
    }

    // 4c. Fix 5: Hallucinated reference detector — STRICTER gate for direct attributions
    // Always blocking — AI must not attribute statements the candidate never made
    if (isEnabled("GROUNDING_GATE_ENABLED") && (sessionState.verifiedFacts?.length || sessionState.recentTurns?.length)) {
      const refResult = detectHallucinatedReferences(
        request.content,
        (sessionState.verifiedFacts || []).map(f => ({
          content: f.content, factType: f.factType, turnId: "prior",
        })),
        sessionState.recentTurns || [],
      );

      if (refResult.hasHallucinatedReferences) {
        const refDetails = refResult.hallucinatedReferences
          .map(r => `"${r.assertion.slice(0, 80)}" (best fact: ${r.bestFactMatch?.similarity.toFixed(2) ?? 'none'}, best turn: ${r.bestTurnMatch?.similarity.toFixed(2) ?? 'none'})`)
          .join("; ");

        violations.push({
          type: "hallucinated_reference",
          detail: `HALLUCINATED_REFERENCE: ${refResult.hallucinatedReferences.length} unverified reference(s): ${refDetails}`,
          severity: "block",
        });

        return {
          passed: false,
          rejectionResult: {
            committed: false, stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "",
            violations,
            reason: "HALLUCINATED_REFERENCE_DETECTED",
            regenerationPrompt: `Do NOT reference what the candidate said unless it appears in verified facts. The following references could not be verified: ${refResult.hallucinatedReferences.map(r => r.assertion).join("; ")}`,
          },
          interviewerState, violations, memorySlotWarnings,
        };
      }
    }
  }

  // 4b. Contradiction gate: detect contradictions — HARD BLOCK (F1: zero-tolerance)
  // Runs on every AI turn with verifiedFacts. No bypass path.
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

      // F1: Hard block — any contradiction = rejected turn with regeneration guidance
      if (contradictions.length > 0) {
        const regenerationPrompt = [
          "The following claims contradict verified facts from this conversation:",
          ...contradictions.map((c) => `- ${c.description}`),
          "Confine your response to verified facts only.",
        ].join("\n");

        // FIX-10: Persist contradictions to durable storage (Postgres InterviewEvent)
        try {
          await recordEvent(interviewId, "contradiction_detected", {
            contradictions: contradictions.map((c) => ({ type: c.type, description: c.description, confidence: c.confidence })),
            turnId: request.turnId,
            blockedAt: new Date().toISOString(),
          });
        } catch { /* Durable persistence failure is non-fatal — we're already blocking */ }

        return {
          passed: false,
          rejectionResult: {
            committed: false, stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "",
            violations: contradictions.map((c) => ({
              type: "unsupported_claim" as const,
              detail: `Contradiction detected (${c.type}): ${c.description}`,
              severity: "block" as const,
            })),
            reason: "SEMANTIC_CONTRADICTION_DETECTED",
            regenerationPrompt,
          },
          interviewerState, violations, memorySlotWarnings,
        };
      }
    } catch (err) {
      // FIX-6: Fail-closed — contradiction gate unavailable → block turn
      const contradictionMs = Date.now() - contradictionStart;
      console.error(`[SessionBrain] Contradiction detection failed after ${contradictionMs}ms — blocking turn:`, err);
      recordSLOEvent("memory.contradiction.detection_rate", false).catch(() => {});
      return {
        passed: false,
        rejectionResult: {
          committed: false, stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: [{ type: "unsupported_claim" as const, detail: "Contradiction detection unavailable — fail-closed", severity: "block" as const }],
          reason: "CONTRADICTION_GATE_UNAVAILABLE",
        },
        interviewerState, violations, memorySlotWarnings,
      };
    }
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

  // All gates passed
  return { passed: true, interviewerState, violations, memorySlotWarnings };
}

// ── Turn Commit ──────────────────────────────────────────────────────

/**
 * Process and commit a single turn with full server-side validation.
 * Non-atomic fallback — used when ATOMIC_TURN_COMMIT is disabled.
 *
 * 1. Run validation gates (read-only)
 * 2. Commit to canonical ledger with version assertion
 * 3. Apply state machine transitions
 * 4. Return new state hash + context checksum
 */
export async function commitTurn(
  interviewId: string,
  request: TurnCommitRequest,
  sessionState: CommitSessionState
): Promise<TurnCommitResult> {
  // Phase 1: Run all read-only validation gates
  const gates = await runValidationGates(interviewId, request, sessionState);
  if (!gates.passed) return gates.rejectionResult!;

  // Phase 2: Build ledger turn and commit
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
      stateHash: gates.interviewerState.stateHash,
      contextChecksum: sessionState.contextChecksum || "",
      violations: gates.violations,
      reason: commitResult.reason,
    };
  }

  // Phase 3: Apply state machine transitions
  let interviewerState = gates.interviewerState;
  const isAITurn = request.role === "model" || request.role === "interviewer";

  if (isAITurn && !interviewerState.personaLocked) {
    interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
  }

  if (isAITurn && !interviewerState.introDone && interviewerState.currentStep === "opening") {
    interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
  }

  // Phase 4: Compute new context checksum
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
    violations: gates.violations,
    memorySlotWarnings: gates.memorySlotWarnings,
    corrections: gates.violations.length > 0
      ? `${gates.violations.length} violation(s) detected but turn committed (warn mode)`
      : undefined,
    interviewerState: serializeState(interviewerState),
    ledgerVersion: commitResult.currentVersion ?? sessionState.lastTurnIndex + 1,
  };
}

// ── N5: Memory Integrity Checksum ────────────────────────────────────

/**
 * Compute a deterministic memory integrity checksum for a turn.
 * Used to detect memory state drift between turns.
 */
export function computeMemoryIntegrityChecksum(params: {
  ledgerVersion: number;
  lastExtractionTurnIndex: number;
  stateHash: string;
  commitmentCount: number;
  contradictionCount: number;
  confidenceTier: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 32);
}

// ── N2: Atomic Turn Commit ──────────────────────────────────────────

/**
 * Truly atomic turn commit — ALL writes in a single Prisma $transaction.
 * If any write fails, ALL roll back (including the ledger commit).
 *
 * Flow:
 * 1. Run validation gates (read-only, outside transaction)
 * 2. N5: Verify memory integrity checksum against stored value
 * 3. Single $transaction containing:
 *    - Ledger commit (commitSingleTurn with external tx)
 *    - State snapshot upsert
 *    - Per-turn fact extraction (N6)
 *    - Durable contradictions/commitments (N7)
 *    - Source turn ID validation + storage (N8 — enforced)
 *    - Memory integrity checksum (N5)
 *    - Sequence number storage (N9)
 *
 * Integrates: N2, N5, N6, N7, N8, N9.
 */
export async function atomicTurnCommit(
  interviewId: string,
  request: TurnCommitRequest,
  sessionState: CommitSessionState
): Promise<TurnCommitResult> {
  // Phase 1: Run all read-only validation gates (no transaction needed)
  const gates = await runValidationGates(interviewId, request, sessionState);
  if (!gates.passed) return gates.rejectionResult!;

  const { prisma } = await import("@/lib/prisma");
  const isAITurn = request.role === "model" || request.role === "interviewer";
  const isCandidateTurn = request.role === "user" || request.role === "candidate";

  // Phase 1b: N5 — Verify memory integrity checksum against stored value in Postgres
  if (sessionState.lastMemoryChecksum && sessionState.lastTurnIndex >= 0) {
    try {
      const prevTurn = await prisma.interviewTranscript.findFirst({
        where: { interviewId, turnIndex: sessionState.lastTurnIndex },
        select: { memoryChecksum: true },
      });
      if (prevTurn?.memoryChecksum && prevTurn.memoryChecksum !== sessionState.lastMemoryChecksum) {
        console.warn(`[SessionBrain] N5: Memory integrity break — session=${sessionState.lastMemoryChecksum}, stored=${prevTurn.memoryChecksum}`);
        return {
          committed: false,
          stateHash: gates.interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: [],
          reason: "MEMORY_INTEGRITY_BREAK",
        };
      }
    } catch {
      // Non-fatal: if we can't verify, proceed (don't block on DB read failure)
    }
  }

  // Phase 2: ALL writes in a single atomic transaction
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 2a. Commit to canonical ledger (INSIDE transaction — true atomicity)
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
        interviewId, ledgerTurn, sessionState.lastTurnIndex, tx
      );

      if (!commitResult.committed) {
        return {
          committed: false as const,
          stateHash: gates.interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: gates.violations,
          reason: commitResult.reason,
        } satisfies TurnCommitResult;
      }

      const turnIndex = commitResult.turn?.turnIndex ?? commitResult.currentVersion;

      // 2b. State transitions
      let interviewerState = gates.interviewerState;
      if (isAITurn && !interviewerState.personaLocked) {
        interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
      }
      if (isAITurn && !interviewerState.introDone && interviewerState.currentStep === "opening") {
        interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
      }

      const serializedState = serializeState(interviewerState);

      // 2c. State snapshot (INSIDE transaction)
      if (turnIndex !== undefined) {
        await tx.interviewerStateSnapshot.upsert({
          where: { interviewId_turnIndex: { interviewId, turnIndex } },
          update: { stateJson: serializedState, stateHash: interviewerState.stateHash },
          create: { interviewId, turnIndex, stateJson: serializedState, stateHash: interviewerState.stateHash },
        });
      }

      // 2d. N6: Per-turn fact extraction for candidate turns
      let extractedFactCount = 0;
      if (isCandidateTurn && request.content.length > 10) {
        const facts = extractFactsImmediate({ turnId: request.turnId, role: request.role, content: request.content });
        if (facts.length > 0) {
          await tx.interviewFact.createMany({
            data: facts.map((f) => ({
              interviewId,
              turnId: request.turnId,
              factType: f.factType,
              content: f.content,
              confidence: f.confidence,
              extractedBy: "immediate",
            })),
            skipDuplicates: true,
          });
          extractedFactCount = facts.length;
        }
      }

      // 2e. N7: Persist contradictions to InterviewContradiction table
      if (serializedState) {
        try {
          const state = deserializeState(serializedState);
          if (state.contradictionMap.length > 0) {
            for (const c of state.contradictionMap) {
              await tx.interviewContradiction.create({
                data: {
                  interviewId,
                  claimTurnId: c.turnIdA,
                  evidenceTurnId: c.turnIdB,
                  description: c.description,
                  type: "semantic",
                  confidence: 0.8,
                },
              }).catch(() => {}); // Skip duplicates
            }
          }
          if (state.commitments.length > 0) {
            for (const c of state.commitments) {
              await tx.interviewCommitment.upsert({
                where: {
                  id: `${interviewId}-${c.turnId}-${c.description.slice(0, 50)}`,
                },
                update: {
                  status: c.fulfilled ? "fulfilled" : "pending",
                  resolvedAt: c.fulfilled ? new Date() : null,
                },
                create: {
                  interviewId,
                  turnId: c.turnId,
                  description: c.description,
                  status: c.fulfilled ? "fulfilled" : "pending",
                },
              }).catch(() => {}); // Skip duplicates
            }
          }
        } catch { /* Non-fatal — state parsing may fail */ }
      }

      // 2f. N8: Validate and store source_turn_ids — ENFORCED (block on invalid)
      if (isAITurn && request.sourceTurnIds && request.sourceTurnIds.length > 0 && turnIndex !== undefined) {
        const referencedTurns = await tx.interviewTranscript.findMany({
          where: { interviewId, turnId: { in: request.sourceTurnIds } },
          select: { turnId: true },
        });
        const validTurnIds = new Set(referencedTurns.map((t: { turnId: string }) => t.turnId));
        const validatedSourceTurnIds = request.sourceTurnIds.filter((id) => validTurnIds.has(id));
        const invalidSourceTurnIds = request.sourceTurnIds.filter((id) => !validTurnIds.has(id));

        if (invalidSourceTurnIds.length > 0) {
          console.warn(`[SessionBrain] N8: Invalid sourceTurnIds rejected: ${invalidSourceTurnIds.join(", ")}`);
          // N8 ENFORCEMENT: roll back the entire transaction
          throw new Error(`INVALID_SOURCE_TURN_IDS: ${invalidSourceTurnIds.join(", ")}`);
        }

        // Store validated sourceTurnIds in generationMetadata
        await tx.interviewTranscript.updateMany({
          where: { interviewId, turnId: request.turnId },
          data: {
            generationMetadata: {
              sourceTurnIds: validatedSourceTurnIds,
            },
          },
        });
      }

      // 2g. N5: Compute and store memory integrity checksum
      let memoryChecksum: string | undefined;
      if (turnIndex !== undefined) {
        memoryChecksum = computeMemoryIntegrityChecksum({
          ledgerVersion: turnIndex,
          lastExtractionTurnIndex: isCandidateTurn ? turnIndex : (sessionState.lastExtractionTurnIndex ?? -1),
          stateHash: interviewerState.stateHash,
          commitmentCount: interviewerState.commitments?.length ?? 0,
          contradictionCount: interviewerState.contradictionMap?.length ?? 0,
          confidenceTier: "normal",
        });

        await tx.interviewTranscript.updateMany({
          where: { interviewId, turnId: request.turnId },
          data: {
            memoryChecksum,
            sequenceNumber: request.sequenceNumber ?? null,
          },
        });
      }

      // 2h. Compute context checksum
      const newChecksum = computeContextChecksum(
        interviewerState.stateHash,
        turnIndex ?? sessionState.lastTurnIndex + 1,
        (sessionState.factCount ?? 0) + extractedFactCount
      );

      return {
        committed: true as const,
        turnIndex,
        stateHash: interviewerState.stateHash,
        contextChecksum: newChecksum,
        violations: gates.violations,
        memorySlotWarnings: gates.memorySlotWarnings,
        corrections: gates.violations.length > 0
          ? `${gates.violations.length} violation(s) detected but turn committed (warn mode)`
          : undefined,
        interviewerState: serializedState,
        ledgerVersion: turnIndex ?? sessionState.lastTurnIndex + 1,
        memoryChecksum,
      } satisfies TurnCommitResult;
    });

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // N8: Invalid source turn IDs → specific rejection
    if (errMsg.startsWith("INVALID_SOURCE_TURN_IDS")) {
      return {
        committed: false,
        stateHash: gates.interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum || "",
        violations: [{ type: "unsupported_claim", detail: errMsg, severity: "block" }],
        reason: "INVALID_SOURCE_TURN_IDS",
      };
    }

    // Transaction failed — ALL writes rolled back (including ledger commit)
    console.error(`[SessionBrain] Atomic transaction failed for ${interviewId}:`, err);
    recordSLOEvent("session.atomic_commit.success_rate", false).catch(() => {});
    return {
      committed: false,
      stateHash: gates.interviewerState.stateHash,
      contextChecksum: sessionState.contextChecksum || "",
      violations: [],
      reason: "ATOMIC_COMMIT_FAILED",
    };
  }
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

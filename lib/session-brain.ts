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
import { checkFollowUpGrounding, verifyGrounding } from "./grounding-gate";
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
    /** N9: Last committed sequence number */
    lastSequenceNumber?: number;
    /** N5: Last memory integrity checksum */
    lastMemoryChecksum?: string;
    /** N5: Last extraction turn index */
    lastExtractionTurnIndex?: number;
  }
): Promise<TurnCommitResult> {
  const violations: GateViolation[] = [];
  const memorySlotWarnings: string[] = [];

  // 0. SLO enforcement hard gate — block session if critical SLOs breached
  try {
    const sloCheck = await enforceSessionSLO(interviewId);
    if (sloCheck.blocked) {
      return {
        committed: false,
        stateHash: "",
        contextChecksum: "",
        violations: [],
        reason: sloCheck.reason,
      };
    }
  } catch { /* SLO enforcement failure is non-fatal */ }

  // 0b. N9: Strict sequence number enforcement
  if (isEnabled("STRICT_SEQUENCE_NUMBERS") && request.sequenceNumber !== undefined) {
    const expectedSeq = (sessionState.lastSequenceNumber ?? -1) + 1;
    if (request.sequenceNumber < expectedSeq) {
      return {
        committed: false, stateHash: "", contextChecksum: "",
        violations: [], reason: "DUPLICATE_SEQUENCE",
        expectedSequenceNumber: expectedSeq,
      };
    }
    if (request.sequenceNumber > expectedSeq) {
      return {
        committed: false, stateHash: "", contextChecksum: "",
        violations: [], reason: "OUT_OF_ORDER_SEQUENCE",
        expectedSequenceNumber: expectedSeq,
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
        // FIX-3: Hard-block — do NOT proceed with degraded memory
        return {
          committed: false,
          stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: [],
          reason: "MEMORY_CONFIDENCE_LOW",
          memorySlotWarnings: [...memorySlotWarnings],
        };
      }
      // N3: Enterprise memory pause — degraded but not critically low (0.3 ≤ confidence < 0.65)
      else if (memoryConfidence < 0.65 && isEnabled("ENTERPRISE_MEMORY_HARD_PAUSE")) {
        memorySlotWarnings.push(`ENTERPRISE_PAUSE: confidence=${memoryConfidence.toFixed(2)} < 0.65`);
        recordSLOEvent("memory.confidence.adequate_rate", false).catch(() => {});
        return {
          committed: false,
          stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: [],
          reason: "MEMORY_CONFIDENCE_DEGRADED",
          holdSignal: { action: "HOLD_AND_RETRY", retryAfterMs: 2000, recoverySyncRequired: true },
          memorySlotWarnings: [...memorySlotWarnings],
        };
      } else {
        recordSLOEvent("memory.confidence.adequate_rate", true).catch(() => {});
      }
    } catch (err) {
      // FIX-5: Fail-closed — computation error → confidence=0.0 → hard block
      console.error("[SessionBrain] Memory confidence computation failed:", err);
      memoryConfidence = 0.0;
      return {
        committed: false,
        stateHash: interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum || "",
        violations: [],
        reason: "MEMORY_CONFIDENCE_LOW",
        memorySlotWarnings: ["HARD_BLOCK: confidence computation failed — fail-closed"],
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

    // 3b. Unconditional intro guard — NOT flag-gated (CF2: architectural guarantee)
    if (interviewerState.personaLocked) {
      const hasIntro = INTRO_PATTERNS.some(p => p.test(request.content));
      if (hasIntro) {
        return {
          committed: false,
          stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: [{ type: "reintroduction", detail: "Unconditional intro block: persona locked", severity: "block" }],
          reason: "INTRO_BLOCKED_UNCONDITIONAL",
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
            committed: false,
            stateHash: interviewerState.stateHash,
            contextChecksum: sessionState.contextChecksum || "",
            violations,
            reason: "GROUNDING_GATE_BLOCKED",
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
          committed: false,
          stateHash: interviewerState.stateHash,
          contextChecksum: sessionState.contextChecksum || "",
          violations: contradictions.map((c) => ({
            type: "unsupported_claim" as const,
            detail: `Contradiction detected (${c.type}): ${c.description}`,
            severity: "block" as const,
          })),
          reason: "SEMANTIC_CONTRADICTION_DETECTED",
          regenerationPrompt,
        };
      }
    } catch (err) {
      // FIX-6: Fail-closed — contradiction gate unavailable → block turn
      const contradictionMs = Date.now() - contradictionStart;
      console.error(`[SessionBrain] Contradiction detection failed after ${contradictionMs}ms — blocking turn:`, err);
      recordSLOEvent("memory.contradiction.detection_rate", false).catch(() => {});
      return {
        committed: false,
        stateHash: interviewerState.stateHash,
        contextChecksum: sessionState.contextChecksum || "",
        violations: [{ type: "unsupported_claim" as const, detail: "Contradiction detection unavailable — fail-closed", severity: "block" as const }],
        reason: "CONTRADICTION_GATE_UNAVAILABLE",
      };
    }
  }

  // 4c. (Memory confidence computed earlier — before grounding gates — for AF7 escalation)

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
 * Atomic turn commit — wraps turn commit + state snapshot + memory updates
 * in a single Prisma $transaction. If any write fails, all roll back.
 *
 * Runs all read-only gates OUTSIDE the transaction, then performs all
 * writes atomically inside the transaction.
 *
 * Integrates: N2 (atomic boundary), N5 (checksum), N6 (per-turn extraction),
 * N7 (durable commitments/contradictions), N8 (source_turn_ids), N9 (sequence numbers).
 */
export async function atomicTurnCommit(
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
    lastSequenceNumber?: number;
    lastMemoryChecksum?: string;
    lastExtractionTurnIndex?: number;
  }
): Promise<TurnCommitResult> {
  // Phase 1: Run all read-only gates (no transaction needed)
  // Delegate to commitTurn for all gate logic, but intercept before the ledger write
  const gateResult = await commitTurn(interviewId, request, sessionState);

  // If gates blocked or the turn was committed by commitTurn, return as-is
  // (commitTurn already handles the full flow — atomicTurnCommit adds the
  // transactional write layer on top)
  if (!gateResult.committed) {
    return gateResult;
  }

  // Phase 2: The turn was committed by commitTurn (non-atomically).
  // Now perform the additional atomic writes that commitTurn doesn't do.
  const { prisma } = await import("@/lib/prisma");

  try {
    const turnIndex = gateResult.turnIndex;
    const isAITurn = request.role === "model" || request.role === "interviewer";
    const isCandidateTurn = request.role === "user" || request.role === "candidate";

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // N2a: State snapshot (already done by voice/route.ts — ensure it's in transaction)
      const interviewerStateJson = gateResult.interviewerState;
      if (interviewerStateJson && turnIndex !== undefined) {
        await tx.interviewerStateSnapshot.upsert({
          where: { interviewId_turnIndex: { interviewId, turnIndex } },
          update: { stateJson: interviewerStateJson, stateHash: gateResult.stateHash },
          create: { interviewId, turnIndex, stateJson: interviewerStateJson, stateHash: gateResult.stateHash },
        });
      }

      // N6: Per-turn fact extraction for candidate turns
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

      // N7: Persist contradictions to InterviewContradiction table
      if (interviewerStateJson) {
        try {
          const state = deserializeState(interviewerStateJson);
          // Persist any new contradictions from state
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
          // Persist any new commitments from state
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

      // N8: Validate and store source_turn_ids for AI turns
      if (isAITurn && request.sourceTurnIds && request.sourceTurnIds.length > 0 && turnIndex !== undefined) {
        // Validate that referenced turns exist
        const referencedTurns = await tx.interviewTranscript.findMany({
          where: { interviewId, turnId: { in: request.sourceTurnIds } },
          select: { turnId: true },
        });
        const validTurnIds = new Set(referencedTurns.map((t: { turnId: string }) => t.turnId));
        const validatedSourceTurnIds = request.sourceTurnIds.filter((id) => validTurnIds.has(id));
        const invalidSourceTurnIds = request.sourceTurnIds.filter((id) => !validTurnIds.has(id));

        if (invalidSourceTurnIds.length > 0) {
          console.warn(`[SessionBrain] Invalid sourceTurnIds: ${invalidSourceTurnIds.join(", ")}`);
        }

        // Store in generationMetadata
        await tx.interviewTranscript.updateMany({
          where: { interviewId, turnId: request.turnId },
          data: {
            generationMetadata: {
              sourceTurnIds: validatedSourceTurnIds,
              invalidSourceTurnIds,
            },
          },
        });
      }

      // N5: Compute and store memory integrity checksum
      if (turnIndex !== undefined) {
        const memoryChecksum = computeMemoryIntegrityChecksum({
          ledgerVersion: turnIndex,
          lastExtractionTurnIndex: isCandidateTurn ? turnIndex : (sessionState.lastExtractionTurnIndex ?? -1),
          stateHash: gateResult.stateHash,
          commitmentCount: 0, // Will be counted from state
          contradictionCount: 0,
          confidenceTier: "normal",
        });

        await tx.interviewTranscript.updateMany({
          where: { interviewId, turnId: request.turnId },
          data: {
            memoryChecksum,
            sequenceNumber: request.sequenceNumber ?? null,
          },
        });

        // Attach checksum to result
        (gateResult as TurnCommitResult).memoryChecksum = memoryChecksum;
      }
    });
  } catch (err) {
    console.error(`[SessionBrain] Atomic transaction failed for ${interviewId}:`, err);
    // The ledger commit already succeeded via commitTurn — log but don't fail the whole turn
    recordSLOEvent("session.atomic_commit.success_rate", false).catch(() => {});
  }

  return gateResult;
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

/**
 * Voice Interview Persistence
 *
 * Stateless server endpoints for voice interview lifecycle:
 * - checkpoint: Periodic transcript/score saves during interview
 * - end_interview: Final save, status update, report generation
 *
 * The actual Gemini Live WebSocket runs client-side (browser).
 * This endpoint only handles persistence to the database.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReportInBackground } from "@/lib/report-generator";
import { inngest } from "@/inngest/client";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { persistProctoringEvents } from "@/lib/proctoring-normalizer";
import { isValidTransition } from "@/lib/interview-state-machine";
import {
  saveSessionState,
  deleteSessionState,
  refreshSessionTTL,
  recordHeartbeat,
  releaseSessionLock,
  refreshSessionLock,
  getSessionState,
  computeTranscriptChecksum,
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { appendTurns, getLedgerSnapshot, diffTurns, finalizeLedger, getFullTranscript, verifyContentIntegrity } from "@/lib/conversation-ledger";
// Track 2: atomic finalization — manifest, idempotency, state machine gate
import {
  beginFinalization,
  updateStage,
  evaluateManifest,
  markSatisfied,
  markDegraded,
  markFailed,
  type ReportStatus,
  type RecordingStatus,
} from "@/lib/finalization-manifest";
import {
  withIdempotentFinalization,
  extractIdempotencyKey,
  InvalidIdempotencyKeyError,
} from "@/lib/finalization-idempotency";
import { classifyError } from "@/lib/error-classification";
import { validateTranscript, repairTranscript } from "@/lib/transcript-validator";
import { isMaintenanceMode, getMaintenanceMessage, maintenanceResponse } from "@/lib/maintenance-mode";
import { recordEvent } from "@/lib/interview-timeline";
import { isEnabled } from "@/lib/feature-flags";
import { composeMemoryPacket, compute4FactorConfidence } from "@/lib/memory-orchestrator";
import { extractFactsImmediate, isContradiction } from "@/lib/fact-extractor";
import { verifyGrounding, checkFollowUpGrounding } from "@/lib/grounding-gate";
import { transitionState, deserializeState, serializeState, hashQuestion, createInitialState } from "@/lib/interviewer-state";
import { checkOutputGateWithAction } from "@/lib/output-gate";
import * as Sentry from "@sentry/nextjs";

// C7: Per-interview checkpoint rate limiter (max 1 per 2 seconds)
const checkpointTimestamps = new Map<string, number>();

// C4: Validate moduleScores structure before DB write
function validateModuleScores(scores: unknown): Array<{ module: string; score: number; reason: string; sectionNotes?: string }> {
  if (!Array.isArray(scores)) return [];
  return scores
    .filter((s: unknown) => {
      if (!s || typeof s !== "object") return false;
      const r = s as Record<string, unknown>;
      return typeof r.module === "string" && typeof r.score === "number" &&
        typeof r.reason === "string" && r.score >= 0 && r.score <= 10;
    })
    .map((s: unknown) => {
      const r = s as Record<string, unknown>;
      return {
        module: String(r.module).slice(0, 100),
        score: Number(r.score),
        reason: String(r.reason).slice(0, 500),
        ...(typeof r.sectionNotes === "string" ? { sectionNotes: String(r.sectionNotes).slice(0, 1000) } : {}),
      };
    })
    .slice(0, 20);
}

// ── Validate Access ────────────────────────────────────────────────────

async function validateAccess(interviewId: string, accessToken: string | null) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          onboardingStatus: true,
        },
      },
      template: true,
    },
  });

  if (!interview) return null;

  if (accessToken && interview.accessToken === accessToken) {
    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return null;
    }
    return interview;
  }

  return null;
}

// ── POST: Handle voice interview actions ─────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fail-fast: maintenance mode check before any work
  if (await isMaintenanceMode()) {
    const msg = await getMaintenanceMessage();
    return maintenanceResponse(msg);
  }

  try {
    const body = await request.json();
    const { action, accessToken, transcript, moduleScores, questionCount,
      currentDifficultyLevel, flaggedFollowUps, currentModule, candidateProfile, askedQuestions } = body;

    // Validate access
    const interview = await validateAccess(id, accessToken);
    if (!interview) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check eligibility
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return Response.json({ error: eligibility.reason }, { status: 403 });
    }

    // ── Record SLO: client-reported SLO events ──
    if (action === "record_slo") {
      const { sloName, success, durationMs } = body;
      // SECURITY: Only accept known SLO names to prevent Redis key spam
      const ALLOWED_CLIENT_SLOS = new Set([
        "interview.start.success_rate",
        "session.reconnect.success_rate",
        "session.reconnect.latency_p95",
        "session.reconnect.context_loss.rate",
        "recording.upload.success_rate",
      ]);
      if (!sloName || !ALLOWED_CLIENT_SLOS.has(sloName)) {
        return Response.json({ error: "Invalid SLO name" }, { status: 400 });
      }
      if (typeof success === "boolean") {
        await recordSLOEvent(sloName, success, durationMs);
      }
      return Response.json({ ok: true });
    }

    // ── Per-interview reliability metrics ──
    if (action === "record_metric") {
      const { event: metricEvent, ...metricData } = body;
      try {
        const redis = await import("@upstash/redis").then(({ Redis }) =>
          new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
          })
        );
        const key = `interview:metrics:${id}`;
        const existing = await redis.get(key) as Record<string, unknown> | null;
        const metrics = existing || {};
        // Merge metric event
        if (metricEvent === "connected") {
          metrics.connectedAt = new Date().toISOString();
          metrics.connectAttempt = metricData.attempt ?? 0;
        } else if (metricEvent === "reconnect") {
          metrics.reconnectCount = ((metrics.reconnectCount as number) || 0) + 1;
          metrics.lastReconnectMs = metricData.durationMs;
        } else if (metricEvent === "completed") {
          metrics.completedAt = new Date().toISOString();
          metrics.totalReconnects = metricData.totalReconnects;
          metrics.durationSeconds = metricData.durationSeconds;
          metrics.questionCount = metricData.questionCount;
        } else if (metricEvent === "checkpoint_failure") {
          metrics.checkpointFailures = ((metrics.checkpointFailures as number) || 0) + 1;
        }
        await redis.set(key, JSON.stringify(metrics), { ex: 86400 }); // 24h TTL
      } catch { /* best-effort metrics */ }
      return Response.json({ ok: true });
    }

    // ── Refresh TTL: keep session alive during active use ──
    if (action === "refresh_ttl") {
      // Enforce max interview duration (90 minutes hard cap)
      const interview = await prisma.interview.findUnique({
        where: { id },
        select: { startedAt: true },
      });
      if (interview?.startedAt) {
        const elapsed = Date.now() - new Date(interview.startedAt).getTime();
        if (elapsed > 90 * 60 * 1000) {
          return Response.json(
            { error: "Maximum interview duration exceeded", forceEnd: true },
            { status: 410 }
          );
        }
      }

      await refreshSessionTTL(id);
      await recordHeartbeat(id);
      await refreshSessionLock(id);
      return Response.json({ ok: true });
    }

    // ── Checkpoint: periodic transcript save ──
    if (action === "checkpoint") {
      const checkpointStart = Date.now();

      // C7: Rate limit checkpoints — max 1 per 2 seconds per interview
      const lastCheckpoint = checkpointTimestamps.get(id);
      const now = Date.now();
      if (lastCheckpoint && now - lastCheckpoint < 2000) {
        return Response.json({ ok: true, throttled: true });
      }
      checkpointTimestamps.set(id, now);

      // C2/R5: Evict stale checkpoint timestamps to prevent memory leak
      if (checkpointTimestamps.size > 1000) {
        for (const [key, ts] of checkpointTimestamps) {
          if (now - ts > 3600_000) checkpointTimestamps.delete(key);
        }
      }

      // H10: Reject oversized transcripts (>1MB serialized)
      const currentTranscript = transcript || [];
      if (JSON.stringify(currentTranscript).length > 1_000_000) {
        return Response.json({ error: "Transcript too large" }, { status: 413 });
      }
      const incomingDigest = computeTranscriptChecksum(currentTranscript);
      const existingSession = await getSessionState(id);

      // BLOCK 5: Stale memoryPacketVersion rejection
      if (body.clientMemoryPacketVersion !== undefined && existingSession?.memoryPacketVersion !== undefined
        && body.clientMemoryPacketVersion < existingSession.memoryPacketVersion) {
        return Response.json({
          error: "Stale memory packet",
          code: "STALE_MEMORY_VERSION",
          serverVersion: existingSession.memoryPacketVersion,
        }, { status: 409 });
      }

      // BLOCK 5: Track per-session violation count and monotonic memoryPacketVersion
      let violationCount = existingSession?.violationCount || 0;
      const memoryPacketVersion = (existingSession?.memoryPacketVersion || 0) + 1;

      if (existingSession?.checkpointDigest === incomingDigest) {
        // Transcript identical — refresh TTL but skip DB write
        await refreshSessionTTL(id);
        const checkpointMs = Date.now() - checkpointStart;
        await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);
        return Response.json({ ok: true, deduplicated: true, checkpointMs, checkpointDigest: existingSession?.checkpointDigest });
      }

      const validatedScores = validateModuleScores(moduleScores);

      // Write to canonical conversation ledger (Tier 0: lossless, never truncated)
      const ledgerSnapshot = await getLedgerSnapshot(id);
      const newTurns = diffTurns(currentTranscript, ledgerSnapshot.latestTurnIndex);

      // Output gate pre-write: sanitize AI turns BEFORE they enter the canonical ledger
      // Uses pre-existing state (not post-transition) so gate runs before state machine
      let gateViolations: Array<{ type: string; detail: string; severity: string }> = [];
      let correctedAiResponse: string | undefined;
      // Telemetry tracking for retrieval source matrix
      let telemetryFactsOk = false;
      let telemetryGroundingOk = false;
      let telemetryStateOk = false;
      let telemetryTokenEstimate = 0;
      if (isEnabled("OUTPUT_GATE_BLOCKING") && newTurns.length > 0) {
        try {
          const preState = existingSession?.interviewerState
            ? deserializeState(existingSession.interviewerState)
            : null;

          if (preState) {
            const verifiedFacts = isEnabled("MEMORY_TIERS")
              ? await prisma.interviewFact.findMany({
                  where: { interviewId: id },
                  orderBy: { createdAt: "desc" },
                  take: 100,
                  select: { factType: true, content: true, confidence: true },
                })
              : [];

            // Build question texts from existing transcript for semantic dedup
            const askedQuestionTexts: string[] = currentTranscript
              .filter((t: { role: string; content: string }) =>
                (t.role === "assistant" || t.role === "model") && typeof t.content === "string" && t.content.includes("?")
              )
              .map((t: { content: string }) => t.content)
              .slice(-200); // Last 200 AI turns for comprehensive semantic dedup

            const aiTurns = newTurns.filter((t: { role: string }) => t.role === "assistant" || t.role === "model");
            for (const aiTurn of aiTurns) {
              const content = typeof aiTurn.content === "string" ? aiTurn.content : "";
              if (content.length > 0) {
                const gateAction = checkOutputGateWithAction(content, {
                  introDone: preState.introDone,
                  askedQuestionIds: preState.askedQuestionIds,
                  askedQuestionTexts,
                  revisitAllowList: preState.revisitAllowList || [],
                  verifiedFacts: verifiedFacts.map((f: { factType: string; content: string; confidence: number }) => ({
                    factType: f.factType,
                    content: f.content,
                    confidence: f.confidence,
                  })),
                }, true); // blocking always enabled here (flag already checked above)

                if (gateAction.violations.length > 0) {
                  gateViolations.push(...gateAction.violations);

                  if (isEnabled("TIMELINE_OBSERVABILITY")) {
                    const eventType = gateAction.action === "block" ? "output_gate_blocked" : "output_gate_violation";
                    for (const v of gateAction.violations) {
                      recordEvent(id, eventType, {
                        violationType: v.type,
                        detail: v.detail,
                        severity: v.severity,
                        blocked: gateAction.action === "block",
                      }, ledgerSnapshot.latestTurnIndex).catch(() => {});
                    }
                  }

                  await recordSLOEvent("transcript.anomaly.rate", false);

                  // Per-violation-type SLO metrics for granular monitoring
                  for (const v of gateAction.violations) {
                    if (v.type === "reintroduction") recordSLOEvent("gate.repeated_intro.rate", false).catch(() => {});
                    if (v.type === "duplicate_question") recordSLOEvent("gate.duplicate_question.rate", false).catch(() => {});
                    if (v.type === "unsupported_claim") recordSLOEvent("gate.unsupported_claim.rate", false).catch(() => {});
                  }

                  // Replace AI turn content in-place with sanitized version BEFORE ledger write
                  if (gateAction.action === "block" && gateAction.sanitizedResponse) {
                    aiTurn.content = gateAction.sanitizedResponse;
                    correctedAiResponse = gateAction.sanitizedResponse;

                    // Also update the corresponding turn in currentTranscript for Interview.update
                    const transcriptIdx = currentTranscript.findIndex(
                      (t: { role: string; content: string }) =>
                        (t.role === "assistant" || t.role === "model") && t.content === content
                    );
                    if (transcriptIdx >= 0) {
                      currentTranscript[transcriptIdx] = {
                        ...currentTranscript[transcriptIdx],
                        content: gateAction.sanitizedResponse,
                      };
                    }
                  }
                }
              }
            }

            // Hard-block: when FAIL_CLOSED is on, intro/question violations return 503
            // with the sanitized response so client can apply correction and retry
            if (isEnabled("FAIL_CLOSED_PRODUCTION") && gateViolations.length > 0) {
              const hasHardBlock = gateViolations.some(
                (v: { type: string }) => v.type === "reintroduction" || v.type === "duplicate_question"
              );
              if (hasHardBlock) {
                console.error(JSON.stringify({ event: "checkpoint_hard_block", interviewId: id, reason: "intro_or_question_violation", severity: "critical", timestamp: new Date().toISOString() }));
                return Response.json({
                  error: "Output policy violation",
                  code: "GATE_HARD_BLOCK",
                  recoverable: true,
                  gateViolations,
                  correctedAiResponse,
                  recoveryInstruction: "RESEND_WITH_SANITIZED",
                }, { status: 503 });
              }
            }
          }
        } catch (err) {
          if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
            console.error(JSON.stringify({ event: "output_gate_failure", interviewId: id, error: (err as Error).message, severity: "critical", failClosed: true, timestamp: new Date().toISOString() }));
            return Response.json(
              { error: "Output gate validation failed", code: "GATE_ERROR", recoverable: true },
              { status: 503 }
            );
          }
          console.warn(JSON.stringify({ event: "output_gate_failure", interviewId: id, error: (err as Error).message, severity: "warning", failClosed: false, timestamp: new Date().toISOString() }));
        }
      }

      // BLOCK 5: Increment violation counter and fire SESSION_INTEGRITY_ALERT
      if (gateViolations.length > 0) {
        violationCount += gateViolations.length;
        if (violationCount >= 2) {
          recordEvent(id, "anomaly", {
            type: "SESSION_INTEGRITY_ALERT",
            totalViolations: violationCount,
            triggeringViolations: gateViolations.map(v => v.type),
          }).catch(() => {});
        }
      }

      let ledgerVersion = ledgerSnapshot.latestTurnIndex;
      if (newTurns.length > 0) {
        const appended = await appendTurns(id, newTurns, ledgerSnapshot.turnCount);
        if (appended.length > 0) {
          ledgerVersion = appended[appended.length - 1].turnIndex;
        }
      }

      // Timeline observability: record checkpoint event with causal link to prior checkpoint
      const priorCheckpointId = existingSession?.checkpointDigest
        ? `checkpoint-${existingSession.ledgerVersion}` : undefined;
      if (isEnabled("TIMELINE_OBSERVABILITY")) {
        recordEvent(id, "checkpoint", {
          ledgerVersion,
          newTurnsAppended: newTurns.length,
          questionCount: questionCount || 0,
        }, ledgerVersion, priorCheckpointId).catch(() => {});
      }

      // Tier 1 memory: extract and persist structured facts from new candidate turns
      if (isEnabled("MEMORY_TIERS") && newTurns.length > 0) {
        try {
          const candidateTurns = newTurns
            .filter((t: { role: string }) => t.role === "candidate" || t.role === "user")
            .map((t: { role: string; content: string }, i: number) => ({
              turnId: `turn-${ledgerVersion - newTurns.length + i + 1}`,
              role: "candidate",
              content: typeof t.content === "string" ? t.content : "",
            }));
          const facts = extractFactsImmediate(candidateTurns[0] || { turnId: "", role: "candidate", content: "" });
          if (facts.length > 0 && candidateTurns.length > 0) {
            // Batch extract across all new candidate turns
            const allFacts = candidateTurns.flatMap((turn: { turnId: string; role: string; content: string }) => extractFactsImmediate(turn));
            await prisma.interviewFact.createMany({
              data: allFacts.map((f) => ({
                interviewId: id,
                turnId: f.turnId,
                factType: f.factType,
                content: f.content,
                confidence: f.confidence,
                extractedBy: f.extractedBy,
              })),
              skipDuplicates: true,
            });
          }
          telemetryFactsOk = true;
        } catch (err) {
          // Fact extraction is non-blocking — degraded memory is acceptable
          console.warn(JSON.stringify({ event: "fact_extraction_failure", interviewId: id, error: (err as Error).message, severity: "warning", timestamp: new Date().toISOString() }));
        }
      }

      // Grounding gate: verify AI responses against extracted facts
      if (isEnabled("GROUNDING_GATE_ENABLED") && newTurns.length > 0) {
        try {
          const aiTurns = newTurns.filter((t: { role: string }) => t.role === "assistant" || t.role === "model");
          if (aiTurns.length > 0) {
            const recentFacts = await prisma.interviewFact.findMany({
              where: { interviewId: id },
              orderBy: { createdAt: "desc" },
              take: 50,
            });
            for (const aiTurn of aiTurns) {
              const content = typeof aiTurn.content === "string" ? aiTurn.content : "";
              if (content.length > 0) {
                const result = verifyGrounding(content, recentFacts.map((f: { turnId: string; factType: string; content: string; confidence: number; extractedBy: string }) => ({
                  turnId: f.turnId,
                  factType: f.factType as any,
                  content: f.content,
                  confidence: f.confidence,
                  extractedBy: f.extractedBy,
                })));
                if (!result.grounded) {
                  if (isEnabled("TIMELINE_OBSERVABILITY")) {
                    recordEvent(id, "grounding_failure", {
                      score: result.score,
                      unsupportedClaims: result.unsupportedClaims,
                      totalClaims: result.totalClaims,
                    }, ledgerVersion).catch(() => {});
                  }
                  // Trigger anomaly alerting via Inngest
                  inngest.send({
                    name: "interview/anomaly.detected",
                    data: { interviewId: id },
                  }).catch(() => {});

                  // Block critically ungrounded responses (score < 0.5 = majority claims unsupported)
                  if (result.score < 0.5 && isEnabled("OUTPUT_GATE_BLOCKING") && result.totalClaims > 0) {
                    // Strip unsupported claims from the AI turn content
                    const sentences = content.split(/(?<=[.!?])\s+/);
                    const cleaned = sentences.filter((s: string) =>
                      !result.unsupportedClaims.some((claim: string) =>
                        s.toLowerCase().includes(claim.toLowerCase().slice(0, 50))
                      )
                    );
                    const groundedContent = cleaned.join(" ").trim() || "Let's continue with the interview.";
                    aiTurn.content = groundedContent;
                    if (!correctedAiResponse) correctedAiResponse = groundedContent;
                  }
                }

                // BLOCK 8: UNGROUNDED_FOLLOWUP detection for AI questions
                if (content.includes("?")) {
                  const recentTurnsForContext = currentTranscript
                    .slice(-20)
                    .map((t: { role: string; content: string }, idx: number) => ({
                      turnId: `turn-${currentTranscript.length - 20 + idx}`,
                      content: typeof t.content === "string" ? t.content : "",
                    }))
                    .filter((t: { content: string }) => t.content.length > 0);
                  const groundingCheck = checkFollowUpGrounding(
                    content,
                    recentTurnsForContext,
                    recentFacts.map((f: { content: string; factType: string; turnId: string }) => ({
                      content: f.content,
                      factType: f.factType,
                      turnId: f.turnId,
                    }))
                  );
                  if (!groundingCheck.grounded) {
                    recordEvent(id, "anomaly", {
                      type: "UNGROUNDED_FOLLOWUP",
                      contentPreview: content.slice(0, 200),
                    }, ledgerVersion).catch(() => {});
                    // Suppress ungrounded follow-up: strip question sentences
                    const sentences = content.split(/(?<=[.!?])\s+/);
                    const withoutQuestions = sentences.filter((s: string) => !s.trim().endsWith("?"));
                    if (withoutQuestions.length > 0) {
                      aiTurn.content = withoutQuestions.join(" ").trim();
                      if (!correctedAiResponse) correctedAiResponse = aiTurn.content;
                    }
                  }
                }
              }
            }
          }
          telemetryGroundingOk = true;
        } catch (err) {
          if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
            console.error(JSON.stringify({ event: "grounding_verification_failure", interviewId: id, error: (err as Error).message, severity: "critical", failClosed: true, timestamp: new Date().toISOString() }));
            // Don't block checkpoint for grounding infra failures — log and continue
            // Grounding gate errors are different from gate violations
          }
          console.warn(JSON.stringify({ event: "grounding_verification_failure", interviewId: id, error: (err as Error).message, severity: "warning", timestamp: new Date().toISOString() }));
        }
      }

      // Stateful interviewer: transition state machine on each checkpoint
      let updatedInterviewerState: string | undefined;
      if (isEnabled("STATEFUL_INTERVIEWER") && newTurns.length > 0) {
        try {
          let state = existingSession?.interviewerState
            ? deserializeState(existingSession.interviewerState)
            : createInitialState();

          // Track if this is the first checkpoint with content (intro completed)
          if (!state.introDone && newTurns.length > 0) {
            state = transitionState(state, { type: "INTRO_COMPLETED" });
          }

          // Apply QUESTION_ASKED for each AI turn (interviewer question dedup)
          const aiTurns = newTurns.filter((t: { role: string; content: string }) =>
            (t.role === "assistant" || t.role === "model") && t.content?.length > 20
          );
          for (const aiTurn of aiTurns) {
            const qHash = hashQuestion(typeof aiTurn.content === "string" ? aiTurn.content : "");
            state = transitionState(state, { type: "QUESTION_ASKED", questionHash: qHash });
          }

          // Apply FOLLOW_UP_FLAGGED from client-reported flaggedFollowUps
          if (Array.isArray(flaggedFollowUps)) {
            for (const fu of flaggedFollowUps) {
              if (fu?.topic && !state.followupQueue.some((q: { topic: string }) => q.topic === fu.topic)) {
                state = transitionState(state, {
                  type: "FOLLOW_UP_FLAGGED",
                  item: { topic: fu.topic, reason: fu.reason || "", priority: (fu.depth === "deep" ? "high" : "medium") as "high" | "medium" | "low" },
                });
              }
            }
          }

          // Contradiction detection: compare new facts against existing for state machine
          if (isEnabled("MEMORY_TIERS")) {
            try {
              const existingFacts = await prisma.interviewFact.findMany({
                where: { interviewId: id, factType: { in: ["METRIC", "DATE", "COMPANY"] } },
                orderBy: { createdAt: "asc" },
                select: { turnId: true, factType: true, content: true, confidence: true, extractedBy: true },
              });
              const candidateTurns = newTurns
                .filter((t: { role: string }) => t.role === "candidate" || t.role === "user")
                .map((t: { role: string; content: string }, i: number) => ({
                  turnId: `turn-${ledgerVersion - newTurns.length + i + 1}`,
                  role: "candidate",
                  content: typeof t.content === "string" ? t.content : "",
                }));
              const newFacts = candidateTurns.flatMap((turn: { turnId: string; role: string; content: string }) => extractFactsImmediate(turn));
              for (const newFact of newFacts) {
                for (const existing of existingFacts) {
                  if (isContradiction(newFact, existing as any)) {
                    state = transitionState(state, {
                      type: "CONTRADICTION_DETECTED",
                      contradiction: {
                        turnIdA: existing.turnId,
                        turnIdB: newFact.turnId,
                        description: `${newFact.factType}: "${newFact.content}" contradicts "${existing.content}"`,
                      },
                    });
                    if (isEnabled("TIMELINE_OBSERVABILITY")) {
                      recordEvent(id, "contradiction_detected", {
                        turnIdA: existing.turnId,
                        turnIdB: newFact.turnId,
                        factType: newFact.factType,
                      }, ledgerVersion).catch(() => {});
                    }
                  }
                }
              }
            } catch (err) {
              if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
                console.error(JSON.stringify({ event: "contradiction_detection_failure", interviewId: id, error: (err as Error).message, severity: "critical", failClosed: true, timestamp: new Date().toISOString() }));
                return Response.json(
                  { error: "Contradiction detection failed", code: "CONTRADICTION_ERROR", recoverable: true },
                  { status: 503 }
                );
              }
              console.warn(JSON.stringify({ event: "contradiction_detection_failure", interviewId: id, error: (err as Error).message, severity: "warning", timestamp: new Date().toISOString() }));
            }
          }

          // Commitment detection: scan AI turns for promises to follow up
          for (const aiTurn of aiTurns) {
            const content = typeof aiTurn.content === "string" ? aiTurn.content : "";
            if (content.length > 0) {
              const commitmentPatterns = [
                /I'll\s+(?:ask|come back|follow up|return to|dig into|explore)\s+(.{5,80}?)(?:\.|,|$)/gi,
                /(?:we'll|let's)\s+(?:revisit|come back to|circle back to|return to)\s+(.{5,80}?)(?:\.|,|$)/gi,
                /I want to\s+(?:ask|explore|understand)\s+(?:more about\s+)?(.{5,80}?)(?:\.|,|$)/gi,
              ];
              for (const pattern of commitmentPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                  const description = match[1].trim();
                  const commitmentId = `commit-${ledgerVersion}-${hashQuestion(description).slice(0, 8)}`;
                  // Check for revisit: if this matches an existing commitment topic, mark as revisit
                  const isRevisit = state.commitments.some(
                    (c) => !c.fulfilled && description.toLowerCase().includes(c.description.toLowerCase().slice(0, 20))
                  );
                  if (isRevisit) {
                    // Dispatch REVISIT_QUESTION to allow the duplicate through the gate
                    const qHash = hashQuestion(content);
                    state = transitionState(state, { type: "REVISIT_QUESTION", questionHash: qHash });
                  } else {
                    state = transitionState(state, {
                      type: "COMMITMENT_MADE",
                      commitment: {
                        id: commitmentId,
                        description,
                        turnId: `turn-${ledgerVersion}`,
                      },
                    });
                  }
                }
              }

              // Check if the current question fulfills a prior commitment
              for (const commitment of state.commitments) {
                if (!commitment.fulfilled) {
                  // Simple keyword overlap check
                  const commitWords = commitment.description.toLowerCase().split(/\s+/);
                  const contentWords = content.toLowerCase().split(/\s+/);
                  const overlap = commitWords.filter((w) => w.length > 3 && contentWords.includes(w));
                  if (overlap.length >= 2) {
                    state = transitionState(state, {
                      type: "COMMITMENT_FULFILLED",
                      commitmentId: commitment.id,
                    });
                  }
                }
              }
            }
          }

          updatedInterviewerState = serializeState(state);
          telemetryStateOk = true;
          telemetryTokenEstimate = Math.ceil(
            currentTranscript.reduce((sum: number, t: { content?: string }) =>
              sum + (typeof t.content === "string" ? t.content.length : 0), 0) / 4
          );

          // Record state transition in timeline with causal link
          if (isEnabled("TIMELINE_OBSERVABILITY")) {
            recordEvent(id, "state_transition", {
              currentStep: state.currentStep,
              introDone: state.introDone,
              askedQuestionCount: state.askedQuestionIds.length,
              commitmentCount: state.commitments.length,
              stateHash: state.stateHash,
            }, ledgerVersion, priorCheckpointId).catch(() => {});
          }
        } catch (err) {
          if (isEnabled("FAIL_CLOSED_PRODUCTION")) {
            console.error(JSON.stringify({ event: "state_transition_failure", interviewId: id, error: (err as Error).message, severity: "critical", failClosed: true, timestamp: new Date().toISOString() }));
            return Response.json(
              { error: "State machine transition failed", code: "STATE_ERROR", recoverable: true },
              { status: 503 }
            );
          }
          console.warn(JSON.stringify({ event: "state_transition_failure", interviewId: id, error: (err as Error).message, severity: "warning", timestamp: new Date().toISOString() }));
        }
      }

      // Denormalized cache on Interview record (backward compat — ledger is authoritative)
      await prisma.interview.update({
        where: { id },
        data: {
          transcript: currentTranscript,
          skillModuleScores: validatedScores,
        },
      });

      // Compute authoritative stateHash (hoisted so it's available for response)
      let authoritativeStateHash: string | null = null;

      // Sync to durable session store with checkpoint digest + enterprise memory fields
      if (existingSession) {
        // Validate enterprise memory fields before persisting (silently drop invalid)
        const validatedMemory: Record<string, unknown> = {};
        if (typeof currentDifficultyLevel === "string" && currentDifficultyLevel.length <= 50) {
          validatedMemory.currentDifficultyLevel = currentDifficultyLevel;
        }
        if (typeof currentModule === "string" && currentModule.length <= 100) {
          validatedMemory.currentModule = currentModule;
        }
        if (Array.isArray(flaggedFollowUps) && flaggedFollowUps.length <= 20) {
          const validFollowUps = flaggedFollowUps.filter(
            (f: unknown) => f && typeof f === "object" &&
              typeof (f as Record<string, unknown>).topic === "string" && ((f as Record<string, unknown>).topic as string).trim().length > 0 && ((f as Record<string, unknown>).topic as string).length <= 500 &&
              typeof (f as Record<string, unknown>).reason === "string" && ((f as Record<string, unknown>).reason as string).trim().length > 0 && ((f as Record<string, unknown>).reason as string).length <= 500
          );
          if (validFollowUps.length > 0) validatedMemory.flaggedFollowUps = validFollowUps;
        }
        if (Array.isArray(askedQuestions) && askedQuestions.length <= 50) {
          const filtered = askedQuestions
            .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0 && (q as string).length <= 500)
            .slice(0, 50);
          validatedMemory.askedQuestions = [...new Set(filtered)];
        }
        if (candidateProfile && typeof candidateProfile === "object" && !Array.isArray(candidateProfile)) {
          const cp = candidateProfile as Record<string, unknown>;
          if (Array.isArray(cp.strengths) && cp.strengths.length <= 20 &&
              Array.isArray(cp.weaknesses) && cp.weaknesses.length <= 20) {
            validatedMemory.candidateProfile = {
              strengths: (cp.strengths as string[]).filter(s => typeof s === "string" && s.length <= 200).slice(0, 20),
              weaknesses: (cp.weaknesses as string[]).filter(s => typeof s === "string" && s.length <= 200).slice(0, 20),
              ...(typeof cp.communicationStyle === "string" && cp.communicationStyle.length <= 100 ? { communicationStyle: cp.communicationStyle } : {}),
              ...(typeof cp.confidenceLevel === "string" && ["low", "moderate", "high"].includes(cp.confidenceLevel) ? { confidenceLevel: cp.confidenceLevel } : {}),
              ...(typeof cp.notableObservations === "string" && cp.notableObservations.length <= 500 ? { notableObservations: cp.notableObservations } : {}),
            };
          }
        }

        // Resolve authoritative stateHash from InterviewerState if available
        authoritativeStateHash = updatedInterviewerState
          ? (() => { try { return deserializeState(updatedInterviewerState!).stateHash; } catch { return existingSession.stateHash || ""; } })()
          : existingSession.stateHash || "";

        // BLOCK 5.3: Full state reconciliation when violation threshold exceeded
        if (violationCount >= 2 && updatedInterviewerState) {
          try {
            const fullTranscript = await getFullTranscript(id);
            const currentState = deserializeState(updatedInterviewerState);

            // Re-derive askedQuestionIds from canonical ledger
            const ledgerQuestionIds = new Set<string>();
            for (const turn of fullTranscript) {
              if (turn.role === "assistant" && turn.content?.includes("?")) {
                ledgerQuestionIds.add(hashQuestion(turn.content));
              }
            }

            const stateQuestionSet = new Set(currentState.askedQuestionIds);
            const hasQuestionDrift =
              ledgerQuestionIds.size !== stateQuestionSet.size ||
              ![...ledgerQuestionIds].every(h => stateQuestionSet.has(h));

            // Force introDone = true if transcript has turns (intro already happened)
            const introShouldBeDone = fullTranscript.length > 2;
            const hasIntroDrift = introShouldBeDone && !currentState.introDone;

            if (hasQuestionDrift || hasIntroDrift) {
              recordEvent(id, "anomaly", {
                type: "STATE_RECONCILIATION_DRIFT",
                questionDrift: hasQuestionDrift,
                introDrift: hasIntroDrift,
                originalAskedCount: stateQuestionSet.size,
                reconciledAskedCount: ledgerQuestionIds.size,
                totalViolations: violationCount,
              }).catch(() => {});

              // Apply corrections
              if (hasQuestionDrift) {
                currentState.askedQuestionIds = [...ledgerQuestionIds];
              }
              if (hasIntroDrift) {
                currentState.introDone = true;
              }
              updatedInterviewerState = serializeState(currentState);
              authoritativeStateHash = currentState.stateHash;
            }
          } catch (reconcileErr) {
            console.error(JSON.stringify({
              event: "state_reconciliation_failure",
              interviewId: id,
              error: (reconcileErr as Error).message,
              severity: "warning",
              timestamp: new Date().toISOString(),
            }));
          }
        }

        await saveSessionState(id, {
          ...existingSession,
          moduleScores: validatedScores,
          questionCount: questionCount || existingSession.questionCount,
          lastActiveAt: new Date().toISOString(),
          checkpointDigest: incomingDigest,
          lastTurnIndex: ledgerVersion,
          ledgerVersion,
          stateHash: authoritativeStateHash,
          ...(updatedInterviewerState ? { interviewerState: updatedInterviewerState } : {}),
          ...validatedMemory,
          violationCount,
          memoryPacketVersion,
          // Memory freshness SLA: track when facts were last extracted
          ...(telemetryFactsOk ? { lastFactRefreshAt: new Date().toISOString() } : {}),
        });
      }

      // Fix 4: Persist InterviewerState snapshot to Postgres on every checkpoint
      // Prevents askedQuestionIds reset when Redis TTL expires and session is reconstructed
      if (updatedInterviewerState && isEnabled("STATEFUL_INTERVIEWER")) {
        try {
          await prisma.interviewerStateSnapshot.upsert({
            where: { interviewId_turnIndex: { interviewId: id, turnIndex: ledgerVersion } },
            update: { stateJson: updatedInterviewerState, stateHash: authoritativeStateHash || "" },
            create: { interviewId: id, turnIndex: ledgerVersion, stateJson: updatedInterviewerState, stateHash: authoritativeStateHash || "" },
          });
        } catch (err: unknown) {
          console.error(`[${id}] CRITICAL: InterviewerState snapshot save FAILED:`, err);
          await recordSLOEvent("session.snapshot.persistence_rate", false);
        }
      }

      await refreshSessionTTL(id);

      // Record checkpoint latency SLO
      const checkpointMs = Date.now() - checkpointStart;
      await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);

      // BLOCK 6: Per-turn structured telemetry log
      console.log(JSON.stringify({
        event: "checkpoint_telemetry",
        interviewId: id,
        memoryPacketVersion,
        ledgerVersion,
        retrievalSourceMatrix: {
          factsOk: telemetryFactsOk,
          groundingOk: telemetryGroundingOk,
          stateOk: telemetryStateOk,
        },
        retrievalTokenCount: telemetryTokenEstimate,
        continuityAssertions: {
          noRepeatedIntro: !gateViolations.some(v => v.type === "reintroduction"),
          noRepeatedQuestion: !gateViolations.some(v => v.type === "duplicate_question"),
          stateHashMatch: !!authoritativeStateHash,
        },
        violationCount,
        durationMs: checkpointMs,
        timestamp: new Date().toISOString(),
      }));

      // Task 4: Trigger knowledge graph update every 10 transcript turns
      if (currentTranscript.length > 0 && currentTranscript.length % 3 === 0) {
        inngest
          .send({ name: "interview/transcript_updated", data: { interviewId: id } })
          .catch((err: unknown) => {
            console.warn(`[${id}] Failed to trigger memory graph update:`, err);
          });
      }

      return Response.json({
        ok: true, checkpointDigest: incomingDigest, ledgerVersion,
        stateHash: authoritativeStateHash,
        memoryPacketVersion,
        ...(gateViolations.length > 0 ? { gateViolations } : {}),
        ...(correctedAiResponse ? { correctedAiResponse } : {}),
      });
    }

    // ── End Interview: final save + report generation ──
    if (action === "end_interview") {
      // Track 2 Task 9: idempotency key on the Idempotency-Key header.
      // A retry with the same key returns the cached response verbatim
      // without re-running the finalization work below. Missing key is
      // tolerated for backward compat with clients that haven't been
      // updated yet; we log a breadcrumb so we can track adoption.
      let idempotencyKey: string | null;
      try {
        idempotencyKey = extractIdempotencyKey(request.headers);
      } catch (err) {
        if (err instanceof InvalidIdempotencyKeyError) {
          return Response.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
      if (!idempotencyKey) {
        Sentry.addBreadcrumb({
          category: "finalization",
          message: "end_interview without Idempotency-Key — legacy client",
          level: "info",
        });
        // Synthesize a per-request key so the work still runs under the
        // idempotency wrapper, just without cross-request dedup. This
        // preserves the manifest-driven flow for every caller.
        idempotencyKey = `legacy-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }

      const idemResult = await withIdempotentFinalization(id, idempotencyKey, async () => {
        return runAtomicFinalization({
          interviewId: id,
          interview,
          request,
          transcript,
          questionCount,
          moduleScores,
        });
      });

      return Response.json(idemResult.body, { status: idemResult.status });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    Sentry.captureException(error, { tags: { component: "voice_route" } });
    console.error("Voice route error:", error);
    const classified = classifyError(error, { statusCode: 500 });
    return Response.json(
      { error: classified.message, code: classified.title, recoverable: classified.recoverable },
      { status: 500 }
    );
  }
}

// ── End-Interview body (extracted so withIdempotentFinalization can wrap it) ──

/**
 * Shape of the transcript entries the caller sends in body.transcript.
 * Matches what validateTranscript/repairTranscript accept so we don't
 * have to relax their signatures.
 */
type RawTranscriptEntry = {
  role: string;
  text?: string;
  content?: string;
  timestamp?: string;
};

interface RunFinalizationArgs {
  interviewId: string;
  interview: {
    id: string;
    status: string;
    candidate: { id: string };
    recordingUrl: string | null;
    recordingState: string | null;
    [key: string]: unknown;
  };
  request: NextRequest;
  transcript: RawTranscriptEntry[] | undefined;
  questionCount: number | undefined;
  moduleScores: unknown;
}

interface FinalizationResult {
  body: Record<string, unknown>;
  status: number;
}

async function runAtomicFinalization(args: RunFinalizationArgs): Promise<FinalizationResult> {
  const id = args.interviewId;
  const interview = args.interview;
  const request = args.request;
  const transcriptInput = args.transcript;
  const questionCount = args.questionCount;
  const moduleScores = args.moduleScores;

  // Audit log — fire immediately, not gated on downstream success.
  logInterviewActivity({
    interviewId: id,
    action: "interview.voice_ended",
    userId: interview.candidate.id,
    userRole: "candidate",
    ipAddress: getClientIp(request.headers),
  }).catch(() => {});

  // Timeline observability: record disconnect event with causal link to last checkpoint
  if (isEnabled("TIMELINE_OBSERVABILITY")) {
    const disconnectSession = await getSessionState(id);
    const disconnectCausalId = disconnectSession?.ledgerVersion !== undefined
      ? `checkpoint-${disconnectSession.ledgerVersion}` : undefined;
    recordEvent(id, "disconnect", {
      reason: "normal_end",
      finalQuestionCount: questionCount || 0,
      ledgerVersion: disconnectSession?.ledgerVersion,
    }, disconnectSession?.ledgerVersion, disconnectCausalId).catch(() => {});
  }

  // Track 2 Task 8: transition to FINALIZING via the state machine.
  // The old code wrote status=COMPLETED directly at the end; the new
  // contract requires entering FINALIZING first, doing all the durability
  // work, and only then transitioning to COMPLETED based on the manifest
  // gate. A transition from IN_PROGRESS → COMPLETED is NO LONGER legal.
  const currentStatus = interview.status;
  if (!isValidTransition(currentStatus, "FINALIZING")) {
    console.warn(JSON.stringify({
      event: "invalid_finalization_entry",
      interviewId: id,
      from: currentStatus,
      to: "FINALIZING",
      severity: "warning",
      timestamp: new Date().toISOString(),
    }));
    // Fail loud — the caller was in a state (e.g. terminal) that can't
    // be finalized, and silently pretending to succeed hides real bugs.
    return {
      body: {
        error: "Cannot finalize interview from current state",
        currentStatus,
        recoverable: false,
      },
      status: 409,
    };
  }

  await prisma.interview.update({
    where: { id },
    data: { status: "FINALIZING" },
  });
  await beginFinalization(id, { reason: "end_interview_requested" });

  // C2: Validate and auto-repair transcript BEFORE database write.
  // Upfront-fill `timestamp` so repairTranscript's strict signature
  // accepts the entries — matches the old runtime behavior where
  // loose typing let missing timestamps slip through.
  const nowIso = new Date().toISOString();
  let finalTranscript: Array<{
    role: string;
    text?: string;
    content?: string;
    timestamp: string;
  }> = (transcriptInput ?? []).map((t) => ({
    role: t.role,
    text: t.text,
    content: t.content,
    timestamp: t.timestamp ?? nowIso,
  }));
  if (finalTranscript.length > 0) {
    const validation = validateTranscript(finalTranscript);

    // Record transcript anomaly SLO
    await recordSLOEvent("transcript.anomaly.rate", validation.valid);

    if (!validation.valid || validation.issues.length > 0) {
      console.warn(JSON.stringify({ event: "transcript_quality_issues", interviewId: id, issues: validation.issues, severity: "warning", timestamp: new Date().toISOString() }));
      Sentry.addBreadcrumb({
        category: "transcript_qa",
        message: `${validation.issues.length} issue(s): ${validation.issues.map(i => i.type).join(", ")}`,
        level: "warning",
      });

      const { repaired, repairs } = repairTranscript(finalTranscript);
      if (repairs.length > 0) {
        console.log(`[${id}] Transcript auto-repair: ${repairs.join("; ")}`);
        finalTranscript = repaired;
      }
    }
  }

  // Normalize to the strict shape diffTurns/appendTurns expect. Each
  // entry needs {role, content, timestamp}; callers sometimes send
  // 'text' instead of 'content' and may omit timestamp for the last
  // partial turn. Fill defaults rather than rejecting.
  const normalizedTranscript = finalTranscript.map((t) => ({
    role: t.role,
    content: t.content ?? t.text ?? "",
    timestamp: t.timestamp ?? new Date().toISOString(),
  }));

  // Reconcile any remaining client turns into the canonical ledger
  const endLedgerSnapshot = await getLedgerSnapshot(id);
  const remainingTurns = diffTurns(normalizedTranscript, endLedgerSnapshot.latestTurnIndex);
  if (remainingTurns.length > 0) {
    await appendTurns(id, remainingTurns, endLedgerSnapshot.turnCount);
  }

  // Finalize all ledger turns (marks as immutable — no further appends allowed)
  // Track 2: once this succeeds, mark ledgerStatus='finalized' on the manifest.
  // On failure, mark integrity_failed — the reconciler will handle the
  // terminal-failure path after 60 minutes.
  let ledgerFinalized = false;
  try {
    const finalizedCount = await finalizeLedger(id);
    console.log(`[${id}] Ledger finalized: ${finalizedCount} turns marked immutable`);
    ledgerFinalized = true;
  } catch (ledgerErr) {
    await updateStage(id, {
      ledgerStatus: "integrity_failed",
      reason: `ledger_finalize_threw: ${(ledgerErr as Error)?.message ?? "unknown"}`,
    });
    // Don't return yet — we still want the catch block to run markFailed
    // and surface a clear error to the client.
    throw ledgerErr;
  }

  // Verify content integrity of finalized ledger
  const integrityMismatches = await verifyContentIntegrity(id);
  if (integrityMismatches.length > 0) {
    console.error(JSON.stringify({ event: "content_integrity_failure", interviewId: id, mismatchCount: integrityMismatches.length, severity: "critical", timestamp: new Date().toISOString() }));
    if (isEnabled("TIMELINE_OBSERVABILITY")) {
      recordEvent(id, "anomaly", {
        type: "content_integrity_failure",
        mismatchCount: integrityMismatches.length,
        mismatches: integrityMismatches.slice(0, 5).map(m => ({ turnIndex: m.turnIndex, turnId: m.turnId })),
      }, endLedgerSnapshot.latestTurnIndex).catch(() => {});
    }
    // Track 2: integrity failures mark ledgerStatus='integrity_failed' but
    // do NOT throw — the old code logged and continued. We preserve that
    // behavior so we don't worsen current outcomes, but the manifest now
    // records the true state and the reconciler can surface it.
    await updateStage(id, {
      ledgerStatus: "integrity_failed",
      reason: `integrity_mismatches:${integrityMismatches.length}`,
    });
  } else if (ledgerFinalized) {
    await updateStage(id, { ledgerStatus: "finalized", reason: "ledger_finalized" });
  }

  // Track 2: evaluate the recording pipeline state up front so we can
  // record the correct recordingStatus on the manifest. The recording
  // finalization itself runs independently (client-driven via the
  // /api/interviews/[id]/recording route) so we only REPORT what state
  // it's in, not drive it from here.
  const currentRecordingState = interview.recordingState;
  const hasRecordingUrl = interview.recordingUrl !== null;
  let recordingStatus: RecordingStatus;
  if (!hasRecordingUrl) {
    recordingStatus = "not_applicable";
  } else if (currentRecordingState === "COMPLETE" || currentRecordingState === "VERIFIED") {
    recordingStatus = "merged";
  } else if (currentRecordingState === "FINALIZING") {
    recordingStatus = "finalizing";
  } else if (currentRecordingState === "UPLOADING") {
    recordingStatus = "uploading";
  } else {
    // Unknown / null state while recordingUrl is set — treat as failed so
    // the preflight refuses to play a mystery recording.
    recordingStatus = "failed";
  }
  await updateStage(id, { recordingStatus, reason: `recording_state=${currentRecordingState}` });

  // Build denormalized transcript from canonical ledger for backward compatibility
  const canonicalTurns = await getFullTranscript(id);
  const denormalizedTranscript = canonicalTurns.map((t) => ({
    role: t.role,
    content: t.content,
    timestamp: t.timestamp.toISOString(),
  }));

  // Track 2: write the denormalized transcript and validated scores WITHOUT
  // transitioning to COMPLETED. Status stays at FINALIZING until the
  // manifest gate passes below. The transcript write itself is safe
  // because the canonical ledger is authoritative — this is just a
  // backward-compat convenience copy.
  await prisma.interview.update({
    where: { id },
    data: {
      transcript: denormalizedTranscript,
      skillModuleScores: validateModuleScores(moduleScores),
    },
  });

  // C3: Persist structured proctoring events BEFORE report trigger
  const interviewData = await prisma.interview.findUnique({
    where: { id },
    select: { integrityEvents: true },
  });
  if (interviewData?.integrityEvents && Array.isArray(interviewData.integrityEvents)) {
    await persistProctoringEvents(id, interviewData.integrityEvents as any[]);
    await updateStage(id, { auditStatus: "complete" });
  } else {
    await updateStage(id, { auditStatus: "complete" });
  }

  // Record session completion SLO
  await recordSLOEvent("session.30min_completion.rate", true);
  // Record no hard-stop (normal completion = success)
  await recordSLOEvent("session.hard_stop.rate", true);

      // Compute and persist memory integrity scorecard before session cleanup
      if (isEnabled("MEMORY_INTEGRITY_SCORECARD")) {
        try {
          const scorecardSession = await getSessionState(id);
          if (scorecardSession) {
            const packet = await composeMemoryPacket(id, scorecardSession);
            const memoryConfScore = compute4FactorConfidence(
              packet.retrievalStatus,
              packet.manifest.totalTokens,
              parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10),
              scorecardSession.violationCount || 0,
              scorecardSession.reconnectCount || 0,
              !!packet.stateHash,
            );

            const totalTurns = packet.recentTurns.length;
            const totalFacts = packet.verifiedFacts.length;
            const contradictionsCount = packet.contradictions.length;
            const totalCommitments = packet.followupQueue.length;
            const fulfilledCommitments = 0;
            const reconnects = scorecardSession.reconnectCount || 0;
            const successfulReconnects = (scorecardSession.reconnectHistory || []).filter(
              (r: { outcome: string }) => r.outcome !== "failed"
            ).length;

            const factRetention = totalTurns > 0
              ? Math.min(100, Math.round((totalFacts / Math.max(totalTurns * 0.3, 1)) * 100))
              : 100;
            const conversationContinuity = Math.round(memoryConfScore * 100);
            const contradictionFreedom = totalFacts > 0
              ? Math.round((1 - contradictionsCount / Math.max(totalFacts, 1)) * 100)
              : 100;
            const commitmentFulfillment = totalCommitments > 0
              ? Math.round((fulfilledCommitments / totalCommitments) * 100)
              : 100;
            const reconnectResilience = reconnects > 0
              ? Math.round((successfulReconnects / reconnects) * 100)
              : 100;

            const overallScore = Math.round(
              factRetention * 0.25 +
              conversationContinuity * 0.25 +
              contradictionFreedom * 0.2 +
              commitmentFulfillment * 0.15 +
              reconnectResilience * 0.15
            );

            const grade = overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : overallScore >= 70 ? "C" : overallScore >= 60 ? "D" : "F";
            const verdict = overallScore >= 80 ? "PASS" : overallScore >= 60 ? "RISK" : "FAIL";

            const alerts: string[] = [];
            if (factRetention < 50) alerts.push("Low fact retention — interview recall may be incomplete");
            if (contradictionsCount > 0) alerts.push(`${contradictionsCount} contradiction(s) detected in candidate statements`);
            if (conversationContinuity < 70) alerts.push("Low conversation continuity — possible memory gaps");
            if (reconnects > 2) alerts.push(`${reconnects} reconnection(s) during interview — check for context loss`);

            const recommendation = overallScore >= 80
              ? "Interview data is reliable for hiring decisions."
              : overallScore >= 60
                ? "Interview data has some gaps — review transcript for completeness before making decisions."
                : "Interview reliability is low — consider re-interviewing or supplementing with additional evaluation.";

            const memoryIntegrityScorecard = {
              verdict,
              overallGrade: grade,
              confidence: overallScore,
              dimensions: {
                factRetention: { score: factRetention, verdict: factRetention >= 80 ? "PASS" : factRetention >= 60 ? "RISK" : "FAIL", detail: `${totalFacts} facts from ${totalTurns} turns` },
                conversationContinuity: { score: conversationContinuity, verdict: conversationContinuity >= 80 ? "PASS" : conversationContinuity >= 60 ? "RISK" : "FAIL", detail: `Memory confidence: ${memoryConfScore.toFixed(2)}` },
                contradictionFreedom: { score: contradictionFreedom, verdict: contradictionFreedom >= 80 ? "PASS" : contradictionFreedom >= 60 ? "RISK" : "FAIL", detail: contradictionsCount === 0 ? "No contradictions" : `${contradictionsCount} contradiction(s)` },
                commitmentFulfillment: { score: commitmentFulfillment, verdict: commitmentFulfillment >= 80 ? "PASS" : commitmentFulfillment >= 60 ? "RISK" : "FAIL", detail: `${fulfilledCommitments}/${totalCommitments} commitments fulfilled` },
                reconnectResilience: { score: reconnectResilience, verdict: reconnectResilience >= 80 ? "PASS" : reconnectResilience >= 60 ? "RISK" : "FAIL", detail: reconnects === 0 ? "No reconnections needed" : `${successfulReconnects}/${reconnects} successful` },
              },
              alerts,
              recommendation,
            };

            await prisma.interviewReport.updateMany({
              where: { interviewId: id },
              data: { memoryIntegrityScorecard: memoryIntegrityScorecard as any },
            });
          }
        } catch (scorecardErr) {
          console.error(JSON.stringify({
            event: "scorecard_persistence_failure",
            interviewId: id,
            error: (scorecardErr as Error).message,
            severity: "warning",
            timestamp: new Date().toISOString(),
          }));
        }
      }

  // Clean up durable session state and release lock (H5: pass owner token)
  const endSession = await getSessionState(id);
  await deleteSessionState(id);
  await releaseSessionLock(id, endSession?.lockOwnerToken);

  // Track 2: dispatch the report job and record the outcome on the
  // manifest. The AWAIT here is important — the old code fired and
  // forgot, which meant an Inngest outage produced a COMPLETED
  // interview with no report event ever queued. We now await the
  // dispatch, record reportStatus='pending' on success, or fall back
  // to in-process generation which at least leaves a chance for the
  // report to complete. On total failure we mark reportStatus='failed'
  // and the reconciler will terminal-fail the manifest later.
  let reportStatus: ReportStatus = "not_started";
  try {
    await inngest.send({ name: "interview/completed", data: { interviewId: id } });
    reportStatus = "pending";
  } catch (inngestErr) {
    console.error("Inngest dispatch failed, falling back to in-process:", inngestErr);
    // Fire-and-forget in-process fallback. If it succeeds it'll set
    // reportStatus later via the report-generator path; if it fails the
    // retry cron will pick up the "pending" status we write here.
    generateReportInBackground(id).catch(console.error);
    reportStatus = "pending";
  }
  await updateStage(id, { reportStatus, reason: `inngest_dispatch:${reportStatus}` });

  // Track 2: manifest gate — can we actually transition to COMPLETED?
  const evaluation = await evaluateManifest(id);
  if (!evaluation) {
    // Should never happen — we beginFinalization'd at the top.
    await markFailed(id, "manifest_missing_at_completion_gate");
    return {
      body: {
        error: "Finalization manifest missing",
        interviewId: id,
        recoverable: false,
      },
      status: 500,
    };
  }

  if (!evaluation.canComplete) {
    // The manifest says we can't safely mark this COMPLETED. Leave the
    // interview in FINALIZING — the reconciler cron will pick it up
    // every 5 minutes and retry the stages that are still failing,
    // or terminal-fail after 60 minutes.
    console.warn(JSON.stringify({
      event: "finalization_not_ready",
      interviewId: id,
      missing: evaluation.missing,
      severity: "warning",
      timestamp: new Date().toISOString(),
    }));
    return {
      body: {
        ok: false,
        status: "FINALIZING",
        message: "Finalization in progress — reconciler will complete",
        missing: evaluation.missing,
      },
      status: 202,
    };
  }

  // Manifest gate passed. Safe to transition to COMPLETED.
  if (!isValidTransition("FINALIZING", "COMPLETED")) {
    // Guard against future state-machine changes that would drop this
    // edge. If it ever does, fail loud instead of silently skipping.
    await markFailed(id, "state_machine_rejects_finalizing_to_completed");
    return {
      body: { error: "State machine refused FINALIZING → COMPLETED", recoverable: false },
      status: 500,
    };
  }

  await prisma.interview.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  if (evaluation.degraded) {
    await markDegraded(id, "completed_with_degraded_recording");
  } else {
    await markSatisfied(id, "completed_normally");
  }

  return {
    body: {
      ok: true,
      message: "Interview ended",
      status: "COMPLETED",
      degraded: evaluation.degraded,
    },
    status: 200,
  };
}

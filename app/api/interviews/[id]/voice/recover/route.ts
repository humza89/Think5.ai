/**
 * Session Recovery API — Deterministic reconnect with version-reconciled state
 *
 * Protocol:
 * 1. Client sends: reconnectToken, clientLedgerVersion, clientStateHash, lockOwnerToken
 * 2. Server verifies token + lock ownership
 * 3. Compare clientLedgerVersion against canonical ledger
 * 4. Return: "synced" (versions match), "delta" (missing turns), or "full" (state hash mismatch)
 *
 * Never returns partial/approximate result — exact reconciliation or full state replacement.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyReconnectToken,
  getSessionState,
  saveSessionState,
  generateReconnectToken,
  reconstructSessionFromLedger,
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";
import { getFullTranscript, getLedgerSnapshot, getTurnsSince, verifyContentIntegrity } from "@/lib/conversation-ledger";
import { isMaintenanceMode, getMaintenanceMessage, maintenanceResponse } from "@/lib/maintenance-mode";
import { recordEvent } from "@/lib/interview-timeline";
import { isEnabled } from "@/lib/feature-flags";
import { deserializeState, computeStateHash } from "@/lib/interviewer-state";

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

  const recoveryStart = Date.now();

  try {
    const body = await request.json();
    const {
      reconnectToken,
      clientLedgerVersion,
      clientStateHash,
      lockOwnerToken: clientOwnerToken,
      // Legacy fields — still accepted for backward compatibility
      clientCheckpointDigest,
      clientTurnIndex,
    } = body;

    if (!reconnectToken) {
      return Response.json({ error: "Missing reconnect token" }, { status: 400 });
    }

    // 1. Verify HMAC-signed reconnect token
    const verification = verifyReconnectToken(id, reconnectToken);
    if (!verification.valid) {
      const status = verification.expired ? 410 : 401;
      return Response.json(
        { error: verification.reason, expired: verification.expired },
        { status }
      );
    }

    // 2. Load session state from Redis (or reconstruct from canonical ledger)
    let session = await getSessionState(id);
    if (!session) {
      // Attempt reconstruction from canonical ledger (Redis outage recovery)
      session = await reconstructSessionFromLedger(id);
      if (session) {
        await saveSessionState(id, session);
        console.log(`[${id}] Session reconstructed from canonical ledger during recovery`);
      }
    }
    if (!session) {
      return Response.json(
        { error: "Session not found and reconstruction failed — it may have expired" },
        { status: 404 }
      );
    }

    // 3. Verify lock ownership (prevents session hijacking with stolen reconnect token)
    if (session.lockOwnerToken && (!clientOwnerToken || clientOwnerToken !== session.lockOwnerToken)) {
      return Response.json(
        { error: "Lock ownership mismatch — session belongs to another client" },
        { status: 403 }
      );
    }

    // 4. Verify token matches stored token (prevents replay of old rotated tokens)
    if (session.reconnectToken !== reconnectToken) {
      return Response.json(
        { error: "Token has been rotated — use the latest token" },
        { status: 401 }
      );
    }

    // 5. Verify interview is still in a reconnectable state
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { status: true, startedAt: true, knowledgeGraph: true },
    });

    if (!interview || !["IN_PROGRESS", "DISCONNECTED"].includes(interview.status)) {
      return Response.json(
        { error: `Interview is ${interview?.status || "not found"} — cannot recover` },
        { status: 409 }
      );
    }

    // Calculate remaining time (90-minute hard cap)
    const MAX_DURATION_MS = 90 * 60 * 1000;
    const elapsedMs = interview.startedAt ? Date.now() - new Date(interview.startedAt).getTime() : 0;
    const remainingSeconds = Math.max(0, Math.floor((MAX_DURATION_MS - elapsedMs) / 1000));

    if (remainingSeconds <= 0) {
      return Response.json(
        { error: "Maximum interview duration exceeded", forceEnd: true, remainingSeconds: 0 },
        { status: 410 }
      );
    }

    // 6. Deterministic reconciliation against canonical ledger
    const ledgerSnapshot = await getLedgerSnapshot(id);
    const serverLedgerVersion = ledgerSnapshot.latestTurnIndex;

    // Compute authoritative stateHash from InterviewerState if available
    let serverStateHash = session.stateHash || "";
    if (isEnabled("STATEFUL_INTERVIEWER") && session.interviewerState) {
      try {
        const iState = deserializeState(session.interviewerState);
        serverStateHash = computeStateHash(iState);
      } catch { /* fall back to stored stateHash */ }
    }

    // Resolve client ledger version (support both new and legacy fields)
    const clientVersion = typeof clientLedgerVersion === "number"
      ? clientLedgerVersion
      : typeof clientTurnIndex === "number"
        ? clientTurnIndex
        : -1;

    // Determine reconciliation strategy
    const versionsMatch = clientVersion === serverLedgerVersion;
    const stateHashMatch = clientStateHash && clientStateHash === serverStateHash;
    const reconciliationType: "synced" | "delta" | "full" = versionsMatch && (stateHashMatch || !clientStateHash) ? "synced"
      : (!versionsMatch && clientVersion >= 0 && clientVersion < serverLedgerVersion) ? "delta"
      : "full";
    const recoveryMs = Date.now() - recoveryStart;

    // 7. Rotate reconnect token (one-time use: old token is now invalid)
    const newReconnectToken = generateReconnectToken(id, serverLedgerVersion, serverStateHash);
    const reconnectHistory = [...(session.reconnectHistory || []), {
      timestamp: new Date().toISOString(),
      ledgerVersion: serverLedgerVersion,
      stateHash: serverStateHash,
      outcome: reconciliationType,
      recoveryMs,
    }].slice(-20); // Cap at 20 entries
    const updatedSession = {
      ...session,
      reconnectToken: newReconnectToken,
      reconnectCount: (session.reconnectCount || 0) + 1,
      lastActiveAt: new Date().toISOString(),
      ledgerVersion: serverLedgerVersion,
      reconnectHistory,
    };
    await saveSessionState(id, updatedSession);

    // 8. Record SLO events
    await Promise.all([
      recordSLOEvent("session.reconnect.success_rate", true),
      recordSLOEvent("session.reconnect.latency_p95", recoveryMs <= 15000, recoveryMs),
      recordSLOEvent("session.reconnect.context_loss.rate", versionsMatch),
      recordSLOEvent("session.context_reset.rate", reconciliationType !== "full"),
    ]);

    // Timeline observability: record reconnect event with reconciliation strategy
    if (isEnabled("TIMELINE_OBSERVABILITY")) {
      // Link reconnect event to prior checkpoint for causal tracing
      const priorCheckpointCausalId = session.ledgerVersion !== undefined
        ? `checkpoint-${session.ledgerVersion}` : undefined;
      recordEvent(id, "reconnect", {
        reconciliationType,
        clientVersion,
        serverLedgerVersion,
        recoveryMs,
        reconnectCount: updatedSession.reconnectCount,
        // Enriched diagnostics for replay-grade reconnect traces
        preStateHash: clientStateHash || null,
        postStateHash: serverStateHash,
        stateHashMatch: clientStateHash === serverStateHash,
        tokenLineage: {
          oldTokenPrefix: reconnectToken.slice(0, 8) + "...",
          newTokenPrefix: newReconnectToken.slice(0, 8) + "...",
        },
        modelInputManifest: {
          askedQuestionsCount: (session.askedQuestions || []).length,
          hasKnowledgeGraph: !!interview.knowledgeGraph,
          hasInterviewerState: !!session.interviewerState,
        },
      }, serverLedgerVersion, priorCheckpointCausalId).catch(() => {});
    }

    // Non-blocking content integrity verification on recovery read path
    verifyContentIntegrity(id).then(mismatches => {
      if (mismatches.length > 0) {
        console.error(`[${id}] Recovery integrity check: ${mismatches.length} mismatches`);
        if (isEnabled("TIMELINE_OBSERVABILITY")) {
          recordEvent(id, "anomaly", {
            type: "content_integrity_failure",
            mismatchCount: mismatches.length,
            context: "recovery",
          }, serverLedgerVersion).catch(() => {});
        }
      }
    }).catch(() => {});

    // Shared response fields
    const knowledgeGraph = interview.knowledgeGraph || null;
    const baseResponse = {
      reconnectCount: updatedSession.reconnectCount,
      newReconnectToken,
      recoveryMs,
      remainingSeconds,
      ledgerVersion: serverLedgerVersion,
      stateHash: serverStateHash,
      askedQuestions: (() => {
        // Server-authoritative askedQuestions: InterviewerState → session fallback
        let resolved: string[] = [];
        if (session.interviewerState) {
          try {
            const iState = deserializeState(session.interviewerState);
            resolved = iState.askedQuestionIds || [];
          } catch { /* fall through */ }
        }
        if (resolved.length === 0) {
          resolved = session.askedQuestions || [];
        }
        // Partial recovery signal: questions asked but no askedQuestions available
        if ((session.questionCount || 0) > 0 && resolved.length === 0) {
          recordEvent(id, "anomaly", {
            type: "missing_asked_questions_on_recovery",
            questionCount: session.questionCount,
          }).catch(() => {});
        }
        return resolved;
      })(),
      knowledgeGraph,
      // Enterprise memory for client ref sync
      enterpriseMemory: {
        currentDifficultyLevel: session.currentDifficultyLevel,
        flaggedFollowUps: session.flaggedFollowUps,
        currentModule: session.currentModule,
        candidateProfile: session.candidateProfile,
        ...(session.interviewerState ? { interviewerState: session.interviewerState } : {}),
      },
    };

    // Case 1: Versions match AND state hashes match → fully synced
    if (versionsMatch && (stateHashMatch || !clientStateHash)) {
      return Response.json({
        ...baseResponse,
        status: "synced",
        resumeFromTurnIndex: serverLedgerVersion,
      });
    }

    // Case 2: Versions diverge → compute and return delta
    if (!versionsMatch && clientVersion >= 0 && clientVersion < serverLedgerVersion) {
      const missingTurns = await getTurnsSince(id, clientVersion);
      return Response.json({
        ...baseResponse,
        status: "delta",
        resumeFromTurnIndex: serverLedgerVersion,
        missingTurns: missingTurns.map((t) => ({
          role: t.role,
          content: t.content,
          timestamp: t.timestamp.toISOString(),
          turnIndex: t.turnIndex,
          turnId: t.turnId,
        })),
        moduleScores: session.moduleScores,
        questionCount: session.questionCount,
      });
    }

    // Case 3: State hash mismatch or client ahead/unknown → full state replacement
    const fullTranscript = await getFullTranscript(id);
    return Response.json({
      ...baseResponse,
      status: "full",
      resumeFromTurnIndex: serverLedgerVersion,
      canonicalTranscript: fullTranscript.map((t) => ({
        role: t.role,
        content: t.content,
        timestamp: t.timestamp.toISOString(),
        turnIndex: t.turnIndex,
        turnId: t.turnId,
      })),
      moduleScores: session.moduleScores,
      questionCount: session.questionCount,
    });
  } catch (error) {
    const classified = classifyError(error);
    console.error(`[${id}] Recovery API error:`, error);
    await recordSLOEvent("session.reconnect.success_rate", false).catch(() => {});
    return Response.json(
      { error: classified.message || "Recovery failed" },
      { status: 500 }
    );
  }
}

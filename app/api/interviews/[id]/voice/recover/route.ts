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
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";
import { getFullTranscript, getLedgerSnapshot, getTurnsSince } from "@/lib/conversation-ledger";
import { isMaintenanceMode, getMaintenanceMessage, maintenanceResponse } from "@/lib/maintenance-mode";
import { recordEvent } from "@/lib/interview-timeline";
import { isEnabled } from "@/lib/feature-flags";

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

    // 2. Load session state from Redis
    const session = await getSessionState(id);
    if (!session) {
      return Response.json(
        { error: "Session not found — it may have expired" },
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
    const serverStateHash = session.stateHash || "";

    // Resolve client ledger version (support both new and legacy fields)
    const clientVersion = typeof clientLedgerVersion === "number"
      ? clientLedgerVersion
      : typeof clientTurnIndex === "number"
        ? clientTurnIndex
        : -1;

    // Determine reconciliation strategy
    const versionsMatch = clientVersion === serverLedgerVersion;
    const stateHashMatch = clientStateHash && clientStateHash === serverStateHash;

    // 7. Rotate reconnect token (one-time use: old token is now invalid)
    const newReconnectToken = generateReconnectToken(id, serverLedgerVersion, serverStateHash);
    const updatedSession = {
      ...session,
      reconnectToken: newReconnectToken,
      reconnectCount: (session.reconnectCount || 0) + 1,
      lastActiveAt: new Date().toISOString(),
      ledgerVersion: serverLedgerVersion,
    };
    await saveSessionState(id, updatedSession);

    // 8. Record SLO events
    const recoveryMs = Date.now() - recoveryStart;
    await Promise.all([
      recordSLOEvent("session.reconnect.success_rate", true),
      recordSLOEvent("session.reconnect.latency_p95", recoveryMs <= 15000, recoveryMs),
      recordSLOEvent("session.reconnect.context_loss.rate", versionsMatch),
    ]);

    // Timeline observability: record reconnect event with reconciliation strategy
    if (isEnabled("TIMELINE_OBSERVABILITY")) {
      const reconciliationType = versionsMatch && (stateHashMatch || !clientStateHash) ? "synced"
        : (!versionsMatch && clientVersion >= 0 && clientVersion < serverLedgerVersion) ? "delta"
        : "full";
      recordEvent(id, "reconnect", {
        reconciliationType,
        clientVersion,
        serverLedgerVersion,
        recoveryMs,
        reconnectCount: updatedSession.reconnectCount,
      }, serverLedgerVersion).catch(() => {});
    }

    // Shared response fields
    const knowledgeGraph = interview.knowledgeGraph || null;
    const baseResponse = {
      reconnectCount: updatedSession.reconnectCount,
      newReconnectToken,
      recoveryMs,
      remainingSeconds,
      ledgerVersion: serverLedgerVersion,
      stateHash: serverStateHash,
      askedQuestions: session.askedQuestions || [],
      knowledgeGraph,
      // Enterprise memory for client ref sync
      enterpriseMemory: {
        currentDifficultyLevel: session.currentDifficultyLevel,
        flaggedFollowUps: session.flaggedFollowUps,
        currentModule: session.currentModule,
        candidateProfile: session.candidateProfile,
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

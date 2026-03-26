/**
 * Session Recovery API — Authoritative reconnect handshake
 *
 * Replaces optimistic status-patching with cryptographic session reconciliation.
 * Client sends HMAC-signed reconnect token + checkpoint digest.
 * Server verifies, reconciles state, rotates token, and returns recovery instructions.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyReconnectToken,
  getSessionState,
  saveSessionState,
  generateReconnectToken,
  computeTranscriptChecksum,
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const recoveryStart = Date.now();

  try {
    const body = await request.json();
    const { reconnectToken, clientCheckpointDigest, clientTurnIndex } = body;

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

    // 3. Verify token matches stored token (prevents replay of old rotated tokens)
    if (session.reconnectToken !== reconnectToken) {
      return Response.json(
        { error: "Token has been rotated — use the latest token" },
        { status: 401 }
      );
    }

    // 4. Verify interview is still in a reconnectable state
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!interview || !["IN_PROGRESS", "DISCONNECTED"].includes(interview.status)) {
      return Response.json(
        { error: `Interview is ${interview?.status || "not found"} — cannot recover` },
        { status: 409 }
      );
    }

    // 5. Reconcile client vs server state
    const serverDigest = session.checkpointDigest || computeTranscriptChecksum(session.transcript);
    const digestMatch = clientCheckpointDigest && clientCheckpointDigest === serverDigest;

    // 6. Rotate reconnect token (one-time use: old token is now invalid)
    const newReconnectToken = generateReconnectToken(id);
    const updatedSession = {
      ...session,
      reconnectToken: newReconnectToken,
      reconnectCount: (session.reconnectCount || 0) + 1,
      lastActiveAt: new Date().toISOString(),
      checkpointDigest: serverDigest,
    };
    await saveSessionState(id, updatedSession);

    // 7. Record SLO events
    const recoveryMs = Date.now() - recoveryStart;
    await Promise.all([
      recordSLOEvent("session.reconnect.success_rate", true),
      recordSLOEvent("session.reconnect.latency_p95", recoveryMs <= 15000, recoveryMs),
      recordSLOEvent("session.reconnect.context_loss.rate", digestMatch !== false),
    ]);

    // 8. Return recovery instructions
    if (digestMatch) {
      return Response.json({
        status: "synced",
        resumeFromTurnIndex: session.lastTurnIndex >= 0 ? session.lastTurnIndex : session.transcript.length - 1,
        reconnectCount: updatedSession.reconnectCount,
        newReconnectToken,
        recoveryMs,
      });
    } else {
      return Response.json({
        status: "diverged",
        canonicalTranscript: session.transcript,
        resumeFromTurnIndex: session.lastTurnIndex >= 0 ? session.lastTurnIndex : session.transcript.length - 1,
        moduleScores: session.moduleScores,
        questionCount: session.questionCount,
        reconnectCount: updatedSession.reconnectCount,
        newReconnectToken,
        recoveryMs,
      });
    }
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

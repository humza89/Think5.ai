/**
 * Context Capsule — Server-assembled reconnect context (Fix 7)
 *
 * Returns a canonical, server-authoritative context capsule containing
 * all state needed for reconnect verification. This eliminates client-side
 * context assembly which can be stale or incorrect.
 *
 * Feature flag: CONTEXT_CAPSULE_PROTOCOL (default: false, opt-in)
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionState } from "@/lib/session-store";
import type { SessionState } from "@/lib/session-store";
import { isEnabled } from "@/lib/feature-flags";
import { recordEvent } from "@/lib/interview-timeline";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Feature gate
  if (!isEnabled("CONTEXT_CAPSULE_PROTOCOL")) {
    return Response.json(
      { error: "Context capsule protocol not enabled", code: "FEATURE_DISABLED" },
      { status: 404 }
    );
  }

  try {
    // 1. Fetch interview exists and is active
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    // 2. Fetch latest interviewer state snapshot from Postgres
    let interviewerState: Record<string, unknown> | null = null;
    try {
      const snapshot = await prisma.interviewerStateSnapshot.findFirst({
        where: { interviewId: id },
        orderBy: { createdAt: "desc" },
        select: { stateJson: true },
      });
      if (snapshot?.stateJson) {
        interviewerState = typeof snapshot.stateJson === "string"
          ? JSON.parse(snapshot.stateJson)
          : snapshot.stateJson as Record<string, unknown>;
      }
    } catch {
      // State snapshot table may not exist yet — graceful degradation
    }

    // 3. Fetch verified facts from Postgres
    let verifiedFacts: Array<{ content: string; confidence: number }> = [];
    try {
      const facts = await prisma.interviewFact.findMany({
        where: { interviewId: id },
        select: { content: true, confidence: true },
        orderBy: { extractedAt: "asc" },
      });
      verifiedFacts = facts.map((f: { content: string; confidence: number | null }) => ({ content: f.content, confidence: f.confidence ?? 1.0 }));
    } catch {
      // Fact table may not exist — graceful degradation
    }

    // 4. Fetch transcript count from Postgres
    let turnCount = 0;
    let lastTurnIndex = -1;
    try {
      turnCount = await prisma.interviewTranscript.count({
        where: { interviewId: id },
      });
      lastTurnIndex = turnCount > 0 ? turnCount - 1 : -1;
    } catch {
      // Transcript table may not exist
    }

    // 5. Get session state from Redis (if available)
    let sessionState: SessionState | null = null;
    try {
      sessionState = await getSessionState(id);
    } catch {
      // Redis may not be available
    }

    // 6. Assemble capsule
    const capsule = {
      capsuleVersion: 1,
      interviewId: id,
      interviewerState: interviewerState ? {
        currentStep: (interviewerState as Record<string, unknown>).step,
        introDone: (interviewerState as Record<string, unknown>).introDone,
        personaLocked: (interviewerState as Record<string, unknown>).personaLocked,
        currentModule: (interviewerState as Record<string, unknown>).currentModule,
      } : null,
      verifiedFacts,
      recentTurnSummary: {
        count: turnCount,
        lastTurnIndex,
      },
      moduleScores: sessionState?.moduleScores ?? [],
      askedQuestions: sessionState?.askedQuestions ?? [],
      memoryConfidence: (sessionState as unknown as Record<string, unknown>)?.memoryConfidence ?? null,
      ledgerVersion: sessionState?.ledgerVersion ?? null,
      stateHash: sessionState?.stateHash ?? null,
    };

    // 7. Compute capsule hash
    const capsuleHash = createHash("sha256")
      .update(JSON.stringify(capsule))
      .digest("hex")
      .slice(0, 32);

    // Record timeline event
    recordEvent(id, "anomaly", {
      type: "context_capsule_served",
      capsuleHash,
      factCount: verifiedFacts.length,
      turnCount,
    }).catch(() => {});

    return Response.json(
      { ...capsule, capsuleHash },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("[ContextCapsule] Error assembling capsule:", error);
    return Response.json(
      { error: "Failed to assemble context capsule" },
      { status: 500 }
    );
  }
}

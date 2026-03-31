/**
 * Turn-Commit Endpoint — Atomic per-turn server verification
 *
 * POST /api/interviews/{id}/voice/turn-commit
 *
 * Receives a single finalized turn from the client, runs server-side
 * validation (output gate, grounding gate, state transitions), and
 * commits to the canonical ledger atomically.
 *
 * Part of the turn-commit protocol: every turn is server-verified
 * before the next generation is permitted.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionState, saveSessionState } from "@/lib/session-store";
import { commitTurn, computeContextChecksum } from "@/lib/session-brain";
import { recordEvent } from "@/lib/interview-timeline";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { isEnabled } from "@/lib/feature-flags";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const startMs = Date.now();

  // Feature flag gate
  if (!isEnabled("TURN_COMMIT_PROTOCOL")) {
    return Response.json(
      { error: "Turn-commit protocol not enabled", code: "FF_DISABLED" },
      { status: 501 }
    );
  }

  // Auth check
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { accessToken: true },
  });
  if (!interview || interview.accessToken !== accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    turnId: string;
    role: "model" | "user" | "interviewer" | "candidate";
    content: string;
    causalParentTurnId?: string;
    clientTimestamp?: string;
    contextChecksum?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.turnId || !body.role || !body.content) {
    return Response.json(
      { error: "Missing required fields: turnId, role, content" },
      { status: 400 }
    );
  }

  // Load session state
  const session = await getSessionState(id);
  if (!session) {
    return Response.json({ error: "No active session" }, { status: 404 });
  }

  // Load verified facts for gate checks
  let verifiedFacts: Array<{ factType: string; content: string; confidence: number }> = [];
  try {
    const facts = await prisma.interviewFact.findMany({
      where: { interviewId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { factType: true, content: true, confidence: true },
    });
    verifiedFacts = facts;
  } catch {
    // Non-fatal: proceed without facts
  }

  // Load recent turns for grounding checks
  let recentTurns: Array<{ turnId: string; content: string }> = [];
  try {
    const turns = await prisma.interviewTranscript.findMany({
      where: { interviewId: id },
      orderBy: { turnIndex: "desc" },
      take: 10,
      select: { turnId: true, content: true },
    });
    recentTurns = turns;
  } catch {
    // Non-fatal
  }

  // Commit the turn via session brain
  const result = await commitTurn(id, body, {
    interviewerState: session.interviewerState,
    lastTurnIndex: session.lastTurnIndex ?? -1,
    verifiedFacts,
    recentTurns,
    contextChecksum: session.turnCommitChecksum,
    factCount: verifiedFacts.length,
  });

  const durationMs = Date.now() - startMs;

  // Update session state if committed
  if (result.committed && result.turnIndex !== undefined) {
    session.lastTurnIndex = result.turnIndex;
    session.ledgerVersion = result.turnIndex;
    session.stateHash = result.stateHash;
    session.turnCommitChecksum = result.contextChecksum;
    session.lastActiveAt = new Date().toISOString();
    // AF1: Persist server-authoritative interviewer state from commit result
    if (result.interviewerState) {
      session.interviewerState = result.interviewerState;
    }
    await saveSessionState(id, session);
  }

  // Record timeline event
  recordEvent(id, "checkpoint", {
    protocol: "turn-commit",
    turnId: body.turnId,
    role: body.role,
    committed: result.committed,
    violations: result.violations.length,
    durationMs,
    reason: result.reason,
  }, result.turnIndex).catch(() => {});

  // SLO tracking
  recordSLOEvent("session.turn_commit.success_rate", result.committed).catch(() => {});
  if (durationMs > 2000) {
    recordSLOEvent("session.turn_commit.latency_p99", false).catch(() => {});
  }

  return Response.json({
    committed: result.committed,
    turnIndex: result.turnIndex,
    stateHash: result.stateHash,
    contextChecksum: result.contextChecksum,
    violations: result.violations,
    corrections: result.corrections,
    reason: result.reason,
    memorySlotWarnings: result.memorySlotWarnings,
    interviewerState: result.interviewerState,
    ledgerVersion: result.ledgerVersion,
    durationMs,
  });
}

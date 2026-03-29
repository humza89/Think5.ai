/**
 * Voice Context API — Chunked turn retrieval from the canonical ledger
 *
 * Returns turns from Postgres (never Redis) for reconnect context injection.
 * Supports token budgeting to fit within Gemini's clientContent limits.
 * This replaces client-side TOKEN_CHAR_BUDGET trimming with server-authoritative retrieval.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionState } from "@/lib/session-store";
import { getLedgerWindow, getLedgerSnapshot } from "@/lib/conversation-ledger";
import { classifyError } from "@/lib/error-classification";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get("accessToken");
    const fromTurnIndex = parseInt(searchParams.get("fromTurnIndex") || "0", 10);
    const maxTurns = parseInt(searchParams.get("maxTurns") || "100", 10);
    const tokenBudget = searchParams.get("tokenBudget")
      ? parseInt(searchParams.get("tokenBudget")!, 10)
      : undefined;

    // Validate access — require either a valid session or access token
    if (accessToken) {
      const session = await getSessionState(id);
      if (!session || session.reconnectToken !== accessToken) {
        return Response.json({ error: "Invalid access token" }, { status: 401 });
      }
    } else {
      return Response.json({ error: "Missing accessToken" }, { status: 400 });
    }

    // Verify interview exists and is accessible
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    // Retrieve turns from canonical ledger with optional token budget
    const turns = await getLedgerWindow(
      id,
      fromTurnIndex,
      Math.min(maxTurns, 500), // Hard cap at 500 turns
      tokenBudget
    );

    const snapshot = await getLedgerSnapshot(id);

    return Response.json({
      turns: turns.map((t) => ({
        role: t.role,
        content: t.content,
        timestamp: t.timestamp.toISOString(),
        turnIndex: t.turnIndex,
        turnId: t.turnId,
      })),
      ledgerVersion: snapshot.latestTurnIndex,
      totalTurns: snapshot.turnCount,
      checksum: snapshot.checksum,
    });
  } catch (error) {
    const classified = classifyError(error);
    console.error(`[${id}] Voice context API error:`, error);
    return Response.json(
      { error: classified.message || "Failed to retrieve context" },
      { status: 500 }
    );
  }
}

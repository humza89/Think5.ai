/**
 * Memory Status Introspection Endpoint
 *
 * Returns memory packet version, retrieval source success matrix,
 * and continuity assertions for recruiter-visible diagnostics.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionState } from "@/lib/session-store";
import { composeMemoryPacket } from "@/lib/memory-orchestrator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth check — accessToken via Authorization header (Bearer <token>)
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { accessToken: true },
  });
  if (!interview || interview.accessToken !== accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getSessionState(id);
  if (!session) {
    return Response.json({ error: "No active session" }, { status: 404 });
  }

  try {
    const packet = await composeMemoryPacket(id, session);

    return Response.json({
      memoryPacketVersion: session.ledgerVersion ?? null,
      stateHash: packet.stateHash,
      memoryConfidence: packet.memoryConfidence,
      retrievalStatus: packet.retrievalStatus,
      sourceSummary: {
        verifiedFactsCount: packet.verifiedFacts.length,
        hasKnowledgeGraph: packet.knowledgeGraph !== null,
        recentTurnsCount: packet.recentTurns.length,
        askedQuestionsCount: packet.askedQuestionIds.length,
        contradictionsCount: packet.contradictions.length,
        pendingClarificationsCount: packet.pendingClarifications.length,
      },
      continuityAssertions: {
        introDone: packet.introDone,
        currentStep: packet.currentStep,
        currentTopic: packet.currentTopic,
      },
    });
  } catch (err) {
    console.error(`[memory-status] [${id}] Failed to compose memory packet:`, err);
    return Response.json(
      { error: "Failed to compose memory packet" },
      { status: 500 }
    );
  }
}

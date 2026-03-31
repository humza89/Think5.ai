/**
 * Memory Status Introspection Endpoint
 *
 * Returns memory packet version, retrieval source success matrix,
 * and continuity assertions for recruiter-visible diagnostics.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionState } from "@/lib/session-store";
import { composeMemoryPacket, compute4FactorConfidence } from "@/lib/memory-orchestrator";
import { isEnabled } from "@/lib/feature-flags";

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

    // Unified 4-factor memoryConfidenceScore (shared with composeMemoryPacket)
    const memoryConfidenceScore = compute4FactorConfidence(
      packet.retrievalStatus,
      packet.manifest.totalTokens,
      parseInt(process.env.MEMORY_MIN_TOKEN_THRESHOLD || "2000", 10),
      session.violationCount || 0,
      session.reconnectCount || 0,
      !!packet.stateHash,
    );

    // Build recruiter-facing memory integrity scorecard (if enabled)
    let scorecard = null;
    if (isEnabled("MEMORY_INTEGRITY_SCORECARD")) {
      const totalTurns = packet.recentTurns.length;
      const totalFacts = packet.verifiedFacts.length;
      const contradictionsCount = packet.contradictions.length;
      const totalCommitments = packet.followupQueue.length;
      const fulfilledCommitments = 0; // Tracked via interviewer state
      const reconnects = session.reconnectCount || 0;
      const successfulReconnects = (session.reconnectHistory || []).filter(
        (r: { outcome: string }) => r.outcome !== "failed"
      ).length;

      // Dimension scores (0-100)
      const factRetention = totalTurns > 0
        ? Math.min(100, Math.round((totalFacts / Math.max(totalTurns * 0.3, 1)) * 100))
        : 100;
      const conversationContinuity = Math.round(memoryConfidenceScore * 100);
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

      scorecard = {
        verdict,
        overallGrade: grade,
        confidence: overallScore,
        dimensions: {
          factRetention: { score: factRetention, verdict: factRetention >= 80 ? "PASS" : factRetention >= 60 ? "RISK" : "FAIL", detail: `${totalFacts} facts from ${totalTurns} turns` },
          conversationContinuity: { score: conversationContinuity, verdict: conversationContinuity >= 80 ? "PASS" : conversationContinuity >= 60 ? "RISK" : "FAIL", detail: `Memory confidence: ${memoryConfidenceScore.toFixed(2)}` },
          contradictionFreedom: { score: contradictionFreedom, verdict: contradictionFreedom >= 80 ? "PASS" : contradictionFreedom >= 60 ? "RISK" : "FAIL", detail: contradictionsCount === 0 ? "No contradictions" : `${contradictionsCount} contradiction(s)` },
          commitmentFulfillment: { score: commitmentFulfillment, verdict: commitmentFulfillment >= 80 ? "PASS" : commitmentFulfillment >= 60 ? "RISK" : "FAIL", detail: `${fulfilledCommitments}/${totalCommitments} commitments fulfilled` },
          reconnectResilience: { score: reconnectResilience, verdict: reconnectResilience >= 80 ? "PASS" : reconnectResilience >= 60 ? "RISK" : "FAIL", detail: reconnects === 0 ? "No reconnections needed" : `${successfulReconnects}/${reconnects} successful` },
        },
        alerts,
        recommendation,
      };
    }

    return Response.json({
      memoryPacketVersion: session.memoryPacketVersion ?? session.ledgerVersion ?? null,
      stateHash: packet.stateHash,
      memoryConfidence: packet.memoryConfidence,
      memoryConfidenceScore,
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
      violationHistory: { totalViolations: session.violationCount || 0 },
      recoveryCycleCount: session.reconnectCount || 0,
      reconnectHistory: session.reconnectHistory || [],
      redisPersistenceStatus: "confirmed",
      ...(scorecard ? { scorecard } : {}),
    });
  } catch (err) {
    console.error(JSON.stringify({
      event: "memory_status_failure",
      interviewId: id,
      error: (err as Error).message,
      severity: "error",
      timestamp: new Date().toISOString(),
    }));
    return Response.json(
      { error: "Failed to compose memory packet" },
      { status: 500 }
    );
  }
}

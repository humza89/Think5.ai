/**
 * Replay Reconstructor — Unified timeline reconstruction for production diagnostics
 *
 * Merges data from multiple sources into a single chronological timeline:
 * - InterviewTranscript (conversation turns)
 * - InterviewEvent (state transitions, anomalies, reconnects)
 * - InterviewFact (fact extraction timeline)
 *
 * Produces a ReplayReport that can be rendered as a one-click diagnostic view
 * for debugging failed interviews and verifying conversation continuity.
 */

// ── Types ────────────────────────────────────────────────────────────

export type ReplayFrameType =
  | "turn"
  | "state_transition"
  | "memory_mutation"
  | "gate_action"
  | "reconnect"
  | "anomaly"
  | "fact_extracted"
  | "commitment";

export interface ReplayFrame {
  timestamp: Date;
  type: ReplayFrameType;
  turnIndex?: number;
  data: Record<string, unknown>;
  causalParentId?: string;
}

export interface DivergencePoint {
  turnIndex: number;
  description: string;
  severity: "critical" | "warning" | "info";
}

export interface ReplayReport {
  interviewId: string;
  frames: ReplayFrame[];
  summary: {
    totalFrames: number;
    durationMs: number;
    turnCount: number;
    reconnectCount: number;
    anomalyCount: number;
    gateViolationCount: number;
    factCount: number;
    contradictionCount: number;
    commitmentsMade: number;
    commitmentsFulfilled: number;
  };
  divergencePoints: DivergencePoint[];
  continuityScore: number; // 0-1, fraction of turns without gaps
}

// ── Reconstruction ───────────────────────────────────────────────────

/**
 * Build a unified replay report for an interview.
 * Merges all data sources into a chronological timeline with divergence detection.
 */
export async function reconstructReplay(interviewId: string): Promise<ReplayReport> {
  const { prisma } = await import("@/lib/prisma");

  // Fetch all data sources in parallel
  const [transcriptRows, eventRows, factRows] = await Promise.all([
    prisma.interviewTranscript.findMany({
      where: { interviewId },
      orderBy: { turnIndex: "asc" },
      select: {
        turnId: true,
        turnIndex: true,
        role: true,
        content: true,
        timestamp: true,
        serverReceivedAt: true,
        contentChecksum: true,
        causalParentTurnId: true,
        finalized: true,
      },
    }),
    prisma.interviewEvent.findMany({
      where: { interviewId },
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        eventType: true,
        payload: true,
        turnIndex: true,
        causalEventId: true,
        timestamp: true,
      },
    }),
    prisma.interviewFact.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        factType: true,
        content: true,
        confidence: true,
        turnId: true,
        extractedBy: true,
        createdAt: true,
      },
    }),
  ]);

  const frames: ReplayFrame[] = [];

  // Add transcript turns as frames
  for (const row of transcriptRows) {
    frames.push({
      timestamp: row.timestamp,
      type: "turn",
      turnIndex: row.turnIndex,
      data: {
        turnId: row.turnId,
        role: row.role,
        contentPreview: row.content.slice(0, 200),
        contentLength: row.content.length,
        contentChecksum: row.contentChecksum,
        finalized: row.finalized,
        serverReceivedAt: row.serverReceivedAt,
      },
      causalParentId: row.causalParentTurnId || undefined,
    });
  }

  // Add events as frames
  let reconnectCount = 0;
  let anomalyCount = 0;
  let gateViolationCount = 0;
  let contradictionCount = 0;
  let commitmentsMade = 0;
  let commitmentsFulfilled = 0;

  for (const event of eventRows) {
    let frameType: ReplayFrameType = "state_transition";
    const payload = event.payload as Record<string, unknown> | null;

    switch (event.eventType) {
      case "reconnect":
        frameType = "reconnect";
        reconnectCount++;
        break;
      case "anomaly":
      case "grounding_failure":
        frameType = "anomaly";
        anomalyCount++;
        break;
      case "output_gate_violation":
      case "output_gate_blocked":
      case "intro_suppressed":
      case "duplicate_question":
        frameType = "gate_action";
        gateViolationCount++;
        break;
      case "contradiction_detected":
        frameType = "anomaly";
        contradictionCount++;
        break;
      case "state_transition":
        frameType = "state_transition";
        if (payload?.type === "COMMITMENT_MADE") commitmentsMade++;
        if (payload?.type === "COMMITMENT_FULFILLED") commitmentsFulfilled++;
        break;
      default:
        frameType = "state_transition";
    }

    frames.push({
      timestamp: event.timestamp,
      type: frameType,
      turnIndex: event.turnIndex ?? undefined,
      data: {
        eventType: event.eventType,
        ...payload,
      },
      causalParentId: event.causalEventId || undefined,
    });
  }

  // Add facts as frames
  for (const fact of factRows) {
    frames.push({
      timestamp: fact.createdAt,
      type: "fact_extracted",
      data: {
        factId: fact.id,
        factType: fact.factType,
        content: fact.content,
        confidence: fact.confidence,
        turnId: fact.turnId,
        extractedBy: fact.extractedBy,
      },
    });
  }

  // Sort all frames chronologically
  frames.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Detect divergence points (gaps in turn sequence, checksum mismatches)
  const divergencePoints: DivergencePoint[] = [];
  for (let i = 1; i < transcriptRows.length; i++) {
    const prev = transcriptRows[i - 1];
    const curr = transcriptRows[i];

    // Gap detection: turnIndex should be consecutive
    if (curr.turnIndex !== prev.turnIndex + 1) {
      divergencePoints.push({
        turnIndex: curr.turnIndex,
        description: `Turn index gap: ${prev.turnIndex} → ${curr.turnIndex} (expected ${prev.turnIndex + 1})`,
        severity: "critical",
      });
    }

    // Timing anomaly: server received more than 60s after client timestamp
    if (curr.serverReceivedAt && curr.timestamp) {
      const lag = curr.serverReceivedAt.getTime() - curr.timestamp.getTime();
      if (lag > 60000) {
        divergencePoints.push({
          turnIndex: curr.turnIndex,
          description: `Server lag: ${Math.round(lag / 1000)}s between client timestamp and server receipt`,
          severity: "warning",
        });
      }
    }
  }

  // Continuity score: fraction of turns without gaps
  const totalGaps = divergencePoints.filter((d) => d.severity === "critical").length;
  const continuityScore = transcriptRows.length > 0
    ? Math.max(0, 1 - totalGaps / transcriptRows.length)
    : 1.0;

  // Duration
  const startTime = frames.length > 0 ? frames[0].timestamp.getTime() : 0;
  const endTime = frames.length > 0 ? frames[frames.length - 1].timestamp.getTime() : 0;

  return {
    interviewId,
    frames,
    summary: {
      totalFrames: frames.length,
      durationMs: endTime - startTime,
      turnCount: transcriptRows.length,
      reconnectCount,
      anomalyCount,
      gateViolationCount,
      factCount: factRows.length,
      contradictionCount,
      commitmentsMade,
      commitmentsFulfilled,
    },
    divergencePoints,
    continuityScore,
  };
}

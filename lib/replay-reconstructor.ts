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
  /** N11: What the model received as input context for this turn */
  modelInputManifest?: {
    memoryPacketHash: string;
    contextTurnCount: number;
    factCount: number;
    confidenceScore: number;
    memoryIntegrityChecksum: string | null;
    sourceTurnIds: string[];
  };
  /** N11: State diff between consecutive interviewer state snapshots */
  stateDiff?: {
    stateHashBefore: string;
    stateHashAfter: string;
    fieldsChanged: string[];
    memoryDeltaSummary: { factsAdded: number; contradictionsDetected: number; commitmentsMade: number };
  };
}

export type DivergenceType =
  | "TURN_INDEX_GAP"
  | "SERVER_LAG"
  | "MEMORY_MANIFEST_DIVERGENCE";

export interface DivergencePoint {
  turnIndex: number;
  description: string;
  severity: "critical" | "warning" | "info";
  type?: DivergenceType;
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

  // Fetch all data sources in parallel (N11: include state snapshots + memoryChecksum)
  const [transcriptRows, eventRows, factRows, snapshotRows] = await Promise.all([
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
        generationMetadata: true,
        memoryChecksum: true,
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
    // N11: Load state snapshots for modelInputManifest + stateDiff
    prisma.interviewerStateSnapshot.findMany({
      where: { interviewId },
      orderBy: { turnIndex: "asc" },
      select: {
        turnIndex: true,
        stateHash: true,
        stateJson: true,
      },
    }),
  ]);

  // N11: Build snapshot map by turnIndex for efficient lookup
  const snapshotByTurnIndex = new Map<number, { stateHash: string; stateJson: string }>();
  for (const snap of snapshotRows) {
    snapshotByTurnIndex.set(snap.turnIndex, { stateHash: snap.stateHash, stateJson: snap.stateJson });
  }

  const frames: ReplayFrame[] = [];

  // N11: Build event-by-turnIndex index for enriching modelInputManifest from event log
  const eventsByTurnIndex = new Map<number, Array<{ eventType: string; payload: Record<string, unknown> | null }>>();
  for (const event of eventRows) {
    if (event.turnIndex !== null && event.turnIndex !== undefined) {
      const list = eventsByTurnIndex.get(event.turnIndex) || [];
      list.push({ eventType: event.eventType, payload: event.payload as Record<string, unknown> | null });
      eventsByTurnIndex.set(event.turnIndex, list);
    }
  }

  // N11: Pre-compute per-turn fact counts for memoryDeltaSummary
  const factCountByTurnIndex = new Map<number, number>();
  for (const fact of factRows) {
    // Find the turn this fact belongs to
    const turn = transcriptRows.find((t: { turnId: string }) => t.turnId === fact.turnId);
    if (turn) {
      factCountByTurnIndex.set(turn.turnIndex, (factCountByTurnIndex.get(turn.turnIndex) || 0) + 1);
    }
  }

  // Add transcript turns as frames — N11: include modelInputManifest for AI turns
  let prevSnapshot: { stateHash: string; stateJson: string } | undefined;
  let prevTurnIndex = -1;
  for (const row of transcriptRows) {
    const isAITurn = row.role === "interviewer" || row.role === "model" || row.role === "assistant";
    const meta = row.generationMetadata as Record<string, unknown> | null;
    const sourceTurnIds = Array.isArray(meta?.sourceTurnIds) ? (meta.sourceTurnIds as string[]) : [];

    const frame: ReplayFrame = {
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
    };

    // N11: modelInputManifest for AI turns — enriched from event log + snapshots
    if (isAITurn) {
      const snapshot = snapshotByTurnIndex.get(row.turnIndex);
      const turnEvents = eventsByTurnIndex.get(row.turnIndex) || [];

      // Extract confidence score from checkpoint event if available
      const checkpointEvent = turnEvents.find(e => e.eventType === "checkpoint");
      const eventConfidence = checkpointEvent?.payload?.memoryConfidence as number | undefined;

      frame.modelInputManifest = {
        memoryPacketHash: snapshot?.stateHash || "",
        contextTurnCount: row.turnIndex + 1,
        factCount: factRows.filter((f: { createdAt: Date }) => f.createdAt <= row.timestamp).length,
        confidenceScore: eventConfidence ?? (snapshot ? 1.0 : 0.0),
        memoryIntegrityChecksum: row.memoryChecksum || null,
        sourceTurnIds,
      };

      // N11: stateDiff between consecutive snapshots with real memoryDeltaSummary
      if (snapshot && prevSnapshot) {
        const fieldsChanged = computeFieldsDiff(prevSnapshot.stateJson, snapshot.stateJson);

        // Compute real memoryDeltaSummary from events + facts between turns
        let factsAdded = 0;
        let contradictionsDetected = 0;
        let commitmentsMade = 0;
        for (let ti = prevTurnIndex + 1; ti <= row.turnIndex; ti++) {
          factsAdded += factCountByTurnIndex.get(ti) || 0;
          const tiEvents = eventsByTurnIndex.get(ti) || [];
          contradictionsDetected += tiEvents.filter(e => e.eventType === "contradiction_detected").length;
          commitmentsMade += tiEvents.filter(e => e.eventType === "state_transition" && e.payload?.type === "COMMITMENT_MADE").length;
        }

        frame.stateDiff = {
          stateHashBefore: prevSnapshot.stateHash,
          stateHashAfter: snapshot.stateHash,
          fieldsChanged,
          memoryDeltaSummary: { factsAdded, contradictionsDetected, commitmentsMade },
        };
      }
      if (snapshot) prevSnapshot = snapshot;
      prevTurnIndex = row.turnIndex;
    }

    frames.push(frame);
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

  // Detect divergence points (gaps in turn sequence, checksum mismatches, manifest divergence)
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
        type: "TURN_INDEX_GAP",
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
          type: "SERVER_LAG",
        });
      }
    }

    // N11: Memory manifest divergence — consecutive AI turns should have consistent state
    const isAITurn = curr.role === "interviewer" || curr.role === "model" || curr.role === "assistant";
    if (isAITurn && curr.memoryChecksum && prev.memoryChecksum) {
      const currSnap = snapshotByTurnIndex.get(curr.turnIndex);
      const prevSnap = snapshotByTurnIndex.get(prev.turnIndex);
      if (currSnap && prevSnap && currSnap.stateHash === prevSnap.stateHash && curr.memoryChecksum !== prev.memoryChecksum) {
        divergencePoints.push({
          turnIndex: curr.turnIndex,
          description: `Memory manifest divergence: state hash unchanged but memory checksum differs`,
          severity: "warning",
          type: "MEMORY_MANIFEST_DIVERGENCE",
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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * N11: Compute shallow field diff between two state JSON strings.
 * Returns the list of top-level keys that changed.
 */
function computeFieldsDiff(beforeJson: string, afterJson: string): string[] {
  try {
    const before = JSON.parse(beforeJson) as Record<string, unknown>;
    const after = JSON.parse(afterJson) as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed: string[] = [];
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed.push(key);
      }
    }
    return changed;
  } catch {
    return ["parse_error"];
  }
}

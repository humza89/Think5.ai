/**
 * Interview Timeline — Replay-grade event recording and retrieval
 *
 * Records every significant event in an interview lifecycle for:
 * - Full audit replay (debugging, compliance)
 * - Anomaly detection (repeated intros, duplicate questions, hallucinations)
 * - Performance monitoring (checkpoint latency, reconnect patterns)
 *
 * All events are append-only in PostgreSQL — never deleted or modified.
 */

import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────

export type EventType =
  | "connect"
  | "disconnect"
  | "reconnect"
  | "checkpoint"
  | "context_version_change"
  | "grounding_failure"
  | "intro_suppressed"
  | "duplicate_question"
  | "topic_reset"
  | "state_transition"
  | "memory_update"
  | "maintenance_mode"
  | "output_gate_violation"
  | "output_gate_blocked"
  | "contradiction_detected"
  | "error"
  | "anomaly";

export interface TimelineEvent {
  id: string;
  interviewId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  turnIndex: number | null;
  causalEventId: string | null;
  timestamp: Date;
}

// ── Recording ────────────────────────────────────────────────────────

/**
 * Record a single event to the interview timeline.
 * Fire-and-forget safe — errors are logged but don't propagate.
 */
export async function recordEvent(
  interviewId: string,
  eventType: EventType,
  payload?: Record<string, unknown>,
  turnIndex?: number,
  causalEventId?: string
): Promise<void> {
  try {
    await prisma.interviewEvent.create({
      data: {
        interviewId,
        eventType,
        payload: payload || undefined,
        turnIndex: turnIndex ?? null,
        causalEventId: causalEventId ?? null,
      },
    });
  } catch (err) {
    console.warn(`[timeline] Failed to record ${eventType} for ${interviewId}:`, err);
  }
}

/**
 * Record multiple events in a single batch (up to 10).
 * More efficient than individual inserts for high-frequency events.
 */
export async function recordEvents(
  interviewId: string,
  events: Array<{
    eventType: EventType;
    payload?: Record<string, unknown>;
    turnIndex?: number;
    causalEventId?: string;
  }>
): Promise<void> {
  if (events.length === 0) return;

  const batch = events.slice(0, 10); // Hard cap at 10 per batch

  try {
    await prisma.interviewEvent.createMany({
      data: batch.map((e) => ({
        interviewId,
        eventType: e.eventType,
        payload: e.payload || undefined,
        turnIndex: e.turnIndex ?? null,
        causalEventId: e.causalEventId ?? null,
      })),
    });
  } catch (err) {
    console.warn(`[timeline] Failed to record batch of ${batch.length} events for ${interviewId}:`, err);
  }
}

// ── Retrieval ────────────────────────────────────────────────────────

/**
 * Retrieve the full event timeline for an interview.
 * Supports optional filtering by event type and time range.
 */
export async function getTimeline(
  interviewId: string,
  filters?: {
    eventType?: EventType;
    fromTimestamp?: Date;
    toTimestamp?: Date;
  }
): Promise<TimelineEvent[]> {
  const where: Record<string, unknown> = { interviewId };

  if (filters?.eventType) {
    where.eventType = filters.eventType;
  }
  if (filters?.fromTimestamp || filters?.toTimestamp) {
    where.timestamp = {
      ...(filters.fromTimestamp ? { gte: filters.fromTimestamp } : {}),
      ...(filters.toTimestamp ? { lte: filters.toTimestamp } : {}),
    };
  }

  const rows = await prisma.interviewEvent.findMany({
    where,
    orderBy: { timestamp: "asc" },
  });

  return rows.map((r: { id: string; interviewId: string; eventType: string; payload: unknown; turnIndex: number | null; causalEventId: string | null; timestamp: Date }) => ({
    id: r.id,
    interviewId: r.interviewId,
    eventType: r.eventType,
    payload: r.payload as Record<string, unknown> | null,
    turnIndex: r.turnIndex,
    causalEventId: r.causalEventId ?? null,
    timestamp: r.timestamp,
  }));
}

/**
 * Generate a structured replay report for audit export.
 * Groups events by phase and annotates anomalies.
 */
export async function generateReplayReport(interviewId: string): Promise<{
  interviewId: string;
  totalEvents: number;
  duration: { start: Date | null; end: Date | null; durationMs: number };
  reconnectCount: number;
  anomalies: TimelineEvent[];
  timeline: TimelineEvent[];
}> {
  const timeline = await getTimeline(interviewId);

  const anomalies = timeline.filter(
    (e) =>
      e.eventType === "grounding_failure" ||
      e.eventType === "duplicate_question" ||
      e.eventType === "anomaly" ||
      e.eventType === "intro_suppressed"
  );

  const reconnectCount = timeline.filter(
    (e) => e.eventType === "reconnect"
  ).length;

  const start = timeline.length > 0 ? timeline[0].timestamp : null;
  const end = timeline.length > 0 ? timeline[timeline.length - 1].timestamp : null;
  const durationMs = start && end ? end.getTime() - start.getTime() : 0;

  return {
    interviewId,
    totalEvents: timeline.length,
    duration: { start, end, durationMs },
    reconnectCount,
    anomalies,
    timeline,
  };
}

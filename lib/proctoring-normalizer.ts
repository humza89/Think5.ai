/**
 * Proctoring Event Normalizer
 *
 * Converts client-side integrity events into normalized ProctoringEvent rows.
 * Ensures both JSON blob (backward compat) and structured rows are populated.
 */

import { prisma } from "@/lib/prisma";
import { computeJsonHash } from "@/lib/versioning";

interface IntegrityEvent {
  type: string;
  description?: string;
  timestamp: string;
  severity?: string;
}

type ProctoringEventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Map event type to severity level.
 */
function mapSeverity(eventType: string): ProctoringEventSeverity {
  const CRITICAL_TYPES = ["webcam_denied"];
  const HIGH_TYPES = ["devtools_attempt", "paste_detected", "fullscreen_exit"];
  const MEDIUM_TYPES = ["tab_switch", "focus_lost", "copy_detected", "right_click", "webcam_lost"];

  if (CRITICAL_TYPES.includes(eventType)) return "CRITICAL";
  if (HIGH_TYPES.includes(eventType)) return "HIGH";
  if (MEDIUM_TYPES.includes(eventType)) return "MEDIUM";
  return "LOW";
}

/** Idempotency key for one client integrity event. */
export function integrityEventKey(interviewId: string, type: string, timestampIso: string): string {
  return `${interviewId}:${type}:${timestampIso}`;
}

export interface IntegrityBatchResult {
  persisted: number;
  deduplicated: number;
}

/**
 * T3: persist a batch of client integrity events exactly once.
 *
 * Deduplicates within the batch and against rows already stored for the
 * interview (same type + timestamp), writes the fresh rows and, unless
 * disabled, appends them to Interview.integrityEvents in the same
 * transaction so the JSON column (read by the text path and reports) and
 * the structured rows never diverge.
 */
export async function persistIntegrityBatch(
  interviewId: string,
  events: IntegrityEvent[],
  options: { appendToInterview?: boolean } = {},
): Promise<IntegrityBatchResult> {
  const appendToInterview = options.appendToInterview ?? true;
  if (!events || events.length === 0) return { persisted: 0, deduplicated: 0 };

  const unique = new Map<string, IntegrityEvent & { timestamp: string }>();
  for (const event of events) {
    const parsed = Date.parse(event.timestamp);
    if (!event.type || Number.isNaN(parsed)) continue;
    const timestamp = new Date(parsed).toISOString();
    const key = integrityEventKey(interviewId, event.type, timestamp);
    if (!unique.has(key)) unique.set(key, { ...event, timestamp });
  }

  const candidates = [...unique.values()];
  if (candidates.length === 0) return { persisted: 0, deduplicated: events.length };

  const existing = await prisma.proctoringEvent.findMany({
    where: { interviewId, timestamp: { in: candidates.map((e) => new Date(e.timestamp)) } },
    select: { eventType: true, timestamp: true },
  });
  const existingKeys = new Set(
    existing.map((row: { eventType: string; timestamp: Date }) => integrityEventKey(interviewId, row.eventType, row.timestamp.toISOString())),
  );
  const fresh = candidates.filter((e) => !existingKeys.has(integrityEventKey(interviewId, e.type, e.timestamp)));

  if (fresh.length > 0) {
    await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.proctoringEvent.createMany({
        data: fresh.map((e) => ({
          interviewId,
          eventType: e.type,
          timestamp: new Date(e.timestamp),
          details: {
            ...(e.description ? { description: e.description } : {}),
            idempotencyKey: integrityEventKey(interviewId, e.type, e.timestamp),
          },
          severity: (e.severity as ProctoringEventSeverity | undefined) ?? mapSeverity(e.type),
        })),
      });
      if (appendToInterview) {
        const current = await tx.interview.findUnique({ where: { id: interviewId }, select: { integrityEvents: true } });
        const list = Array.isArray(current?.integrityEvents) ? (current!.integrityEvents as unknown[]) : [];
        await tx.interview.update({
          where: { id: interviewId },
          data: {
            integrityEvents: [
              ...list,
              ...fresh.map((e) => ({ type: e.type, description: e.description, timestamp: e.timestamp })),
            ] as any,
          },
        });
      }
    });
  }

  return { persisted: fresh.length, deduplicated: events.length - fresh.length };
}

/**
 * Persist integrity events already held on Interview.integrityEvents as
 * structured ProctoringEvent rows (end-of-interview path). Idempotent:
 * repeated calls never create duplicate rows.
 */
export async function persistProctoringEvents(
  interviewId: string,
  events: IntegrityEvent[]
): Promise<{ persisted: number; hash: string }> {
  if (!events || events.length === 0) {
    return { persisted: 0, hash: "" };
  }
  const { persisted } = await persistIntegrityBatch(interviewId, events, { appendToInterview: false });
  // Compute integrity hash for tamper detection
  const hash = computeJsonHash(events);
  return { persisted, hash };
}

/**
 * Get all proctoring events for an interview as structured rows.
 */
export async function getProctoringEvents(interviewId: string) {
  return prisma.proctoringEvent.findMany({
    where: { interviewId },
    orderBy: { timestamp: "asc" },
  });
}

/**
 * Generate an integrity conformance report for an interview.
 * Compares configured policy (what should be enforced) vs actual events.
 */
export async function generateIntegrityConformanceReport(interviewId: string): Promise<{
  interviewId: string;
  generatedAt: string;
  eventsDetected: number;
  bySeverity: Record<ProctoringEventSeverity, number>;
  criticalEvents: Array<{ type: string; timestamp: string; description?: string }>;
  conformanceGaps: string[];
  integrityScore: number;
}> {
  const events = await getProctoringEvents(interviewId);

  const bySeverity: Record<ProctoringEventSeverity, number> = {
    LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
  };

  const criticalEvents: Array<{ type: string; timestamp: string; description?: string }> = [];

  for (const event of events) {
    const severity = (event.severity as ProctoringEventSeverity) || "LOW";
    bySeverity[severity]++;
    if (severity === "CRITICAL") {
      criticalEvents.push({
        type: event.eventType,
        timestamp: event.timestamp.toISOString(),
        description: (event.details as Record<string, string>)?.description,
      });
    }
  }

  // Identify conformance gaps
  const conformanceGaps: string[] = [];
  if (bySeverity.CRITICAL > 0) {
    conformanceGaps.push(`${bySeverity.CRITICAL} CRITICAL event(s) detected — manual review required`);
  }
  if (bySeverity.HIGH >= 3) {
    conformanceGaps.push(`${bySeverity.HIGH} HIGH severity events — potential exam irregularity`);
  }

  // Compute integrity score with diminishing returns per severity tier
  // First event at full weight, subsequent events at decreasing impact
  // This prevents 5 LOW events from being equivalent to 1 HIGH event
  const diminishingDeduction = (count: number, baseWeight: number, minWeight: number): number => {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.max(minWeight, baseWeight * Math.pow(0.7, i));
    }
    return total;
  };

  let integrityScore = 100;
  integrityScore -= diminishingDeduction(bySeverity.LOW, 1, 0.3);
  integrityScore -= diminishingDeduction(bySeverity.MEDIUM, 3, 1);
  integrityScore -= diminishingDeduction(bySeverity.HIGH, 8, 3);
  integrityScore -= diminishingDeduction(bySeverity.CRITICAL, 20, 10);
  integrityScore = Math.max(0, Math.min(100, Math.round(integrityScore)));

  return {
    interviewId,
    generatedAt: new Date().toISOString(),
    eventsDetected: events.length,
    bySeverity,
    criticalEvents,
    conformanceGaps,
    integrityScore,
  };
}

/**
 * Check if an interview has crossed alert thresholds and should trigger notifications.
 */
export async function checkProctoringAlertThresholds(interviewId: string): Promise<{
  shouldAlert: boolean;
  reason: string | null;
}> {
  const events = await getProctoringEvents(interviewId);
  type ProcEvent = (typeof events)[number];
  const criticalCount = events.filter((e: ProcEvent) => e.severity === "CRITICAL").length;

  if (criticalCount >= 3) {
    return { shouldAlert: true, reason: `${criticalCount} CRITICAL proctoring events in single interview` };
  }

  const report = await generateIntegrityConformanceReport(interviewId);
  if (report.integrityScore < 50) {
    return { shouldAlert: true, reason: `Low integrity score: ${report.integrityScore}/100` };
  }

  return { shouldAlert: false, reason: null };
}

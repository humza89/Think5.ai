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

/**
 * Persist integrity events as structured ProctoringEvent rows.
 * Deduplicates by checking for existing events with same type and timestamp.
 */
export async function persistProctoringEvents(
  interviewId: string,
  events: IntegrityEvent[]
): Promise<{ persisted: number; hash: string }> {
  if (!events || events.length === 0) {
    return { persisted: 0, hash: "" };
  }

  const rows = events.map((e) => ({
    interviewId,
    eventType: e.type,
    timestamp: new Date(e.timestamp),
    details: e.description ? { description: e.description } : undefined,
    severity: mapSeverity(e.type),
  }));

  // Batch create (skip duplicates by catching unique constraint errors)
  let persisted = 0;
  for (const row of rows) {
    try {
      await prisma.proctoringEvent.create({ data: row as any });
      persisted++;
    } catch {
      // Skip duplicates or errors — non-critical
    }
  }

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

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

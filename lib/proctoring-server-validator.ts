/**
 * Server-side proctoring validation.
 * Complements client-side event detection with server-verified signals.
 *
 * Validates:
 * 1. Heartbeat consistency — client must send heartbeats at regular intervals
 * 2. Event plausibility — timestamps must be monotonic and within session bounds
 * 3. Behavioral analysis — excessive tab switches, fingerprint changes
 * 4. Session fingerprint — browser fingerprint consistency across events
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface ProctoringEvent {
  interviewId: string;
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface ProctoringFlag {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  evidence: string;
}

interface ValidationResult {
  valid: boolean;
  flags: ProctoringFlag[];
  integrityScore: number;
}

export async function validateProctoringEvents(
  interviewId: string,
  events: ProctoringEvent[]
): Promise<ValidationResult> {
  const flags: ProctoringFlag[] = [];
  let integrityScore = 100;

  // 1. Timestamp monotonicity
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      flags.push({
        type: "TIMESTAMP_REGRESSION",
        severity: "HIGH",
        description: "Event timestamps are not monotonically increasing — possible clock manipulation",
        evidence: `Event ${i}: ${events[i].timestamp} < Event ${i - 1}: ${events[i - 1].timestamp}`,
      });
      integrityScore -= 20;
    }
  }

  // 2. Heartbeat gaps
  const heartbeats = events.filter(e => e.eventType === "heartbeat");
  const maxGap = 30000;
  for (let i = 1; i < heartbeats.length; i++) {
    const gap = heartbeats[i].timestamp - heartbeats[i - 1].timestamp;
    if (gap > maxGap) {
      flags.push({
        type: "HEARTBEAT_GAP",
        severity: "MEDIUM",
        description: `Heartbeat gap of ${Math.round(gap / 1000)}s detected`,
        evidence: `Gap between heartbeat ${i - 1} and ${i}: ${gap}ms`,
      });
      integrityScore -= 10;
    }
  }

  // 3. Excessive tab switches
  const tabSwitches = events.filter(e => e.eventType === "tab_switch");
  if (tabSwitches.length > 50) {
    flags.push({
      type: "EXCESSIVE_TAB_SWITCHES",
      severity: "CRITICAL",
      description: `${tabSwitches.length} tab switches detected — significantly above normal`,
      evidence: `Total tab switches: ${tabSwitches.length}`,
    });
    integrityScore -= 30;
  }

  // 4. Events outside session bounds
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { startedAt: true, completedAt: true },
  });
  if (interview?.startedAt) {
    const sessionStart = new Date(interview.startedAt).getTime();
    const sessionEnd = interview.completedAt
      ? new Date(interview.completedAt).getTime()
      : Date.now();

    const outOfBounds = events.filter(
      e => e.timestamp < sessionStart - 5000 || e.timestamp > sessionEnd + 5000
    );
    if (outOfBounds.length > 0) {
      flags.push({
        type: "OUT_OF_SESSION_EVENTS",
        severity: "HIGH",
        description: `${outOfBounds.length} events outside session time bounds`,
        evidence: `Session: ${sessionStart}-${sessionEnd}, OOB: ${outOfBounds.length}`,
      });
      integrityScore -= 15;
    }
  }

  // 5. Fingerprint consistency
  const fingerprints = new Set(
    events.filter(e => e.metadata?.fingerprint).map(e => e.metadata!.fingerprint as string)
  );
  if (fingerprints.size > 1) {
    flags.push({
      type: "FINGERPRINT_CHANGE",
      severity: "CRITICAL",
      description: "Browser fingerprint changed during session — possible device switch",
      evidence: `Distinct fingerprints: ${fingerprints.size}`,
    });
    integrityScore -= 25;
  }

  integrityScore = Math.max(0, integrityScore);

  if (flags.length > 0) {
    logger.info(`[proctoring-validator] Interview ${interviewId}: ${flags.length} flags, integrity=${integrityScore}`);
  }

  return { valid: flags.length === 0, flags, integrityScore };
}

export function verifyHeartbeat(
  clientTimestamp: number,
  serverTimestamp: number = Date.now()
): { valid: boolean; drift: number } {
  const drift = Math.abs(serverTimestamp - clientTimestamp);
  return { valid: drift <= 30000, drift };
}

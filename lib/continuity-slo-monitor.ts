/**
 * Continuity SLO Monitor — N12: Hard gates for voice mode based on SLO metrics
 *
 * Queries recent SLO events to compute continuity scorecard.
 * When thresholds are breached, voice mode is auto-disabled
 * until metrics recover.
 */

import { prisma } from "@/lib/prisma";

// ── Configuration ────────────────────────────────────────────────────

const SLO_MAX_RESET_RATE = parseFloat(process.env.CONTINUITY_SLO_MAX_RESET_RATE || "0.0");
const SLO_MAX_REPEATED_INTRO_RATE = parseFloat(process.env.CONTINUITY_SLO_MAX_REPEATED_INTRO_RATE || "0.0");
const SLO_MAX_HALLUCINATION_RATE = parseFloat(process.env.CONTINUITY_SLO_MAX_HALLUCINATION_RATE || "0.0");
const SLO_WINDOW_MINUTES = parseInt(process.env.CONTINUITY_SLO_WINDOW_MINUTES || "60", 10);
const SLO_MIN_SAMPLE_SIZE = parseInt(process.env.CONTINUITY_SLO_MIN_SAMPLE_SIZE || "10", 10);

// ── Types ────────────────────────────────────────────────────────────

export interface ContinuitySLOScorecard {
  resetRate: number;
  repeatedIntroRate: number;
  hallucinationRate: number;
  memoryIntegrityBreakRate: number;
  isBreaching: boolean;
  breachReason: string | null;
  sessionCount: number;
  windowMinutes: number;
}

// ── Core Functions ───────────────────────────────────────────────────

/**
 * Compute the current SLO status by querying recent interview events.
 */
export async function getCurrentSLOStatus(): Promise<ContinuitySLOScorecard> {
  const windowStart = new Date(Date.now() - SLO_WINDOW_MINUTES * 60 * 1000);

  // Count distinct sessions in the window
  const recentSessions = await prisma.interviewEvent.groupBy({
    by: ["interviewId"],
    where: {
      timestamp: { gte: windowStart },
      eventType: { in: ["connect", "reconnect"] },
    },
  });
  const sessionCount = recentSessions.length;

  // Not enough data to enforce SLO
  if (sessionCount < SLO_MIN_SAMPLE_SIZE) {
    return {
      resetRate: 0,
      repeatedIntroRate: 0,
      hallucinationRate: 0,
      memoryIntegrityBreakRate: 0,
      isBreaching: false,
      breachReason: null,
      sessionCount,
      windowMinutes: SLO_WINDOW_MINUTES,
    };
  }

  // Count failure events in the window
  const [resetEvents, introEvents, hallucinationEvents, memoryBreakEvents] = await Promise.all([
    prisma.interviewEvent.count({
      where: {
        timestamp: { gte: windowStart },
        eventType: "anomaly",
        payload: { path: ["type"], equals: "CONTEXT_RESET" },
      },
    }),
    prisma.interviewEvent.count({
      where: {
        timestamp: { gte: windowStart },
        eventType: { in: ["intro_suppressed", "output_gate_blocked"] },
      },
    }),
    prisma.interviewEvent.count({
      where: {
        timestamp: { gte: windowStart },
        eventType: { in: ["grounding_failure", "output_gate_blocked"] },
      },
    }),
    prisma.interviewEvent.count({
      where: {
        timestamp: { gte: windowStart },
        eventType: "anomaly",
        payload: { path: ["type"], equals: "MEMORY_INTEGRITY_BREAK" },
      },
    }),
  ]);

  const resetRate = resetEvents / sessionCount;
  const repeatedIntroRate = introEvents / sessionCount;
  const hallucinationRate = hallucinationEvents / sessionCount;
  const memoryIntegrityBreakRate = memoryBreakEvents / sessionCount;

  // Check thresholds
  let breachReason: string | null = null;
  if (resetRate > SLO_MAX_RESET_RATE) {
    breachReason = `Reset rate ${resetRate.toFixed(2)} exceeds threshold ${SLO_MAX_RESET_RATE}`;
  } else if (repeatedIntroRate > SLO_MAX_REPEATED_INTRO_RATE) {
    breachReason = `Repeated intro rate ${repeatedIntroRate.toFixed(2)} exceeds threshold ${SLO_MAX_REPEATED_INTRO_RATE}`;
  } else if (hallucinationRate > SLO_MAX_HALLUCINATION_RATE) {
    breachReason = `Hallucination rate ${hallucinationRate.toFixed(2)} exceeds threshold ${SLO_MAX_HALLUCINATION_RATE}`;
  }

  return {
    resetRate,
    repeatedIntroRate,
    hallucinationRate,
    memoryIntegrityBreakRate,
    isBreaching: breachReason !== null,
    breachReason,
    sessionCount,
    windowMinutes: SLO_WINDOW_MINUTES,
  };
}

/**
 * Determine whether voice mode should be blocked based on SLO status.
 */
export async function shouldBlockVoiceMode(): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const status = await getCurrentSLOStatus();
    if (status.isBreaching) {
      return { blocked: true, reason: status.breachReason || "SLO breach detected" };
    }
    return { blocked: false };
  } catch (err) {
    // Fail-open: if SLO check fails, don't block voice mode
    console.error("[ContinuitySLO] Failed to check SLO status:", err);
    return { blocked: false };
  }
}

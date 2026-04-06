/**
 * Server-side proctoring event validation.
 * Detects impossible sequences, missing expected events, and fabricated data.
 */

interface ProctoringEvent {
  type: string;
  timestamp: string;
  description?: string;
}

interface InterviewTimeline {
  startedAt: string;
  endedAt?: string | null;
}

interface ValidationResult {
  valid: boolean;
  confidence: number; // 0-1, where 1 = high confidence in validity
  flags: string[];
}

/**
 * Validate proctoring events for consistency and plausibility.
 *
 * Checks:
 * 1. Impossible sequences (tab_switch without focus_lost within 1s)
 * 2. Missing expected events (long interview with zero tab_switch)
 * 3. Timing anomalies (all events share identical timestamps)
 */
export function validateProctoringEvents(
  events: ProctoringEvent[],
  interviewTimeline: InterviewTimeline
): ValidationResult {
  const flags: string[] = [];
  let confidence = 1.0;

  if (!events || events.length === 0) {
    // No events — check if the interview was long enough to expect some
    const durationMinutes = getInterviewDurationMinutes(interviewTimeline);
    if (durationMinutes > 20) {
      flags.push(
        `SUSPICIOUS_NO_EVENTS: Interview lasted ${Math.round(durationMinutes)} minutes with zero proctoring events`
      );
      confidence -= 0.2;
    }
    return { valid: flags.length === 0, confidence: Math.max(0, confidence), flags };
  }

  // Parse and sort events by timestamp
  const parsed = events
    .map((e) => ({
      ...e,
      ts: new Date(e.timestamp).getTime(),
    }))
    .filter((e) => !isNaN(e.ts))
    .sort((a, b) => a.ts - b.ts);

  if (parsed.length === 0) {
    flags.push("INVALID_TIMESTAMPS: All proctoring event timestamps are unparseable");
    return { valid: false, confidence: 0, flags };
  }

  // Check 1: Impossible sequences — tab_switch without focus_lost within 1 second
  checkImpossibleSequences(parsed, flags);

  // Check 2: Missing expected events
  checkMissingExpectedEvents(parsed, interviewTimeline, flags);

  // Check 3: Timing anomalies — all identical timestamps
  checkTimingAnomalies(parsed, flags);

  // Adjust confidence based on flags
  const suspiciousFlags = flags.filter((f) => f.startsWith("SUSPICIOUS_"));
  const fabricatedFlags = flags.filter((f) => f.startsWith("FABRICATED_"));
  const impossibleFlags = flags.filter((f) => f.startsWith("IMPOSSIBLE_"));

  confidence -= suspiciousFlags.length * 0.15;
  confidence -= fabricatedFlags.length * 0.3;
  confidence -= impossibleFlags.length * 0.25;

  confidence = Math.max(0, Math.min(1, confidence));

  const valid = fabricatedFlags.length === 0 && impossibleFlags.length === 0;

  return { valid, confidence, flags };
}

function checkImpossibleSequences(
  events: Array<ProctoringEvent & { ts: number }>,
  flags: string[]
): void {
  const WINDOW_MS = 1000; // 1 second

  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "tab_switch") {
      // Look for a focus_lost event within 1s before or after
      const hasFocusLost = events.some(
        (e) =>
          e.type === "focus_lost" &&
          Math.abs(e.ts - events[i].ts) <= WINDOW_MS
      );
      if (!hasFocusLost) {
        flags.push(
          `IMPOSSIBLE_SEQUENCE: tab_switch at ${events[i].timestamp} without focus_lost within ${WINDOW_MS}ms`
        );
      }
    }
  }
}

function checkMissingExpectedEvents(
  events: Array<ProctoringEvent & { ts: number }>,
  interviewTimeline: InterviewTimeline,
  flags: string[]
): void {
  const durationMinutes = getInterviewDurationMinutes(interviewTimeline);

  if (durationMinutes > 20) {
    const tabSwitchCount = events.filter((e) => e.type === "tab_switch").length;
    if (tabSwitchCount === 0) {
      flags.push(
        `SUSPICIOUS_NO_TAB_SWITCHES: Interview lasted ${Math.round(durationMinutes)} minutes with zero tab_switch events`
      );
    }
  }
}

function checkTimingAnomalies(
  events: Array<ProctoringEvent & { ts: number }>,
  flags: string[]
): void {
  if (events.length < 3) return;

  const uniqueTimestamps = new Set(events.map((e) => e.ts));
  if (uniqueTimestamps.size === 1) {
    flags.push(
      `FABRICATED_IDENTICAL_TIMESTAMPS: All ${events.length} proctoring events share the exact same timestamp`
    );
  }
}

function getInterviewDurationMinutes(timeline: InterviewTimeline): number {
  const start = new Date(timeline.startedAt).getTime();
  const end = timeline.endedAt
    ? new Date(timeline.endedAt).getTime()
    : Date.now();

  if (isNaN(start) || isNaN(end)) return 0;
  return (end - start) / (1000 * 60);
}

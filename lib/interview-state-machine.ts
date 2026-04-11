/**
 * Interview Status State Machine
 *
 * Enforces valid status transitions for interviews. Mirrors the
 * InterviewStatus enum in prisma/schema.prisma.
 *
 * Track 2, Task 8 change:
 *   An interview may NO LONGER transition directly from IN_PROGRESS (or
 *   DISCONNECTED/PAUSED) to COMPLETED. The only legal path to COMPLETED
 *   now goes through FINALIZING, and the caller is responsible for
 *   writing a FinalizationManifest row before attempting the
 *   FINALIZING → COMPLETED transition. The manifest check is enforced
 *   at the application layer in the finalization pipeline, not here;
 *   this state machine only gates the transition topology.
 *
 * Transition diagram:
 *   CREATED → PLAN_GENERATED → PENDING → IN_PROGRESS
 *                                       → PAUSED → IN_PROGRESS
 *                                       → DISCONNECTED → IN_PROGRESS
 *   IN_PROGRESS → FINALIZING → COMPLETED → REPORT_GENERATING → REPORT_READY
 *   FINALIZING → CANCELLED (if finalization fatally fails)
 *   PAUSED → FINALIZING    (client ended interview while paused)
 *   DISCONNECTED → FINALIZING (recovery path chose to finalize rather than resume)
 *   REPORT_FAILED → REPORT_GENERATING
 *   (any non-terminal) → CANCELLED
 */

// Keep in sync with prisma InterviewStatus enum
type InterviewStatus =
  | "CREATED"
  | "PLAN_GENERATED"
  | "PENDING"
  | "IN_PROGRESS"
  | "PAUSED"
  | "DISCONNECTED"
  | "FINALIZING"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "REPORT_GENERATING"
  | "REPORT_READY"
  | "REPORT_FAILED";

const VALID_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  CREATED: ["PLAN_GENERATED", "PENDING", "CANCELLED"],
  PLAN_GENERATED: ["PENDING", "CANCELLED"],
  PENDING: ["IN_PROGRESS", "CANCELLED", "EXPIRED"],
  // Track 2 Task 8: IN_PROGRESS → COMPLETED is REMOVED. Finalization
  // must always go through FINALIZING so the FinalizationManifest
  // gate runs.
  IN_PROGRESS: ["FINALIZING", "DISCONNECTED", "PAUSED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "FINALIZING", "CANCELLED"],
  DISCONNECTED: ["IN_PROGRESS", "FINALIZING", "CANCELLED"],
  // FINALIZING is the gated entry to COMPLETED. The only other legal
  // exit is CANCELLED (for catastrophic finalization failure). Reentry
  // from FINALIZING → IN_PROGRESS is intentionally disallowed — once
  // finalization begins, the interview can only end.
  FINALIZING: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REPORT_GENERATING"],
  CANCELLED: [],
  EXPIRED: [],
  REPORT_GENERATING: ["REPORT_READY", "REPORT_FAILED"],
  REPORT_READY: [],
  REPORT_FAILED: ["REPORT_GENERATING"],
};

const TERMINAL_STATES: InterviewStatus[] = [
  "CANCELLED",
  "EXPIRED",
  "REPORT_READY",
];

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as InterviewStatus];
  if (!allowed) return false;
  return allowed.includes(to as InterviewStatus);
}

export function isTerminalState(status: string): boolean {
  return TERMINAL_STATES.includes(status as InterviewStatus);
}

export function getAllowedTransitions(from: string): string[] {
  return VALID_TRANSITIONS[from as InterviewStatus] ?? [];
}

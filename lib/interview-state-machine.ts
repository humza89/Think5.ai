/**
 * Interview Status State Machine
 *
 * Enforces valid status transitions for interviews. Mirrors the
 * InterviewStatus enum in prisma/schema.prisma.
 *
 * Transition diagram:
 *   CREATED → PLAN_GENERATED → PENDING → IN_PROGRESS → COMPLETED → REPORT_GENERATING → REPORT_READY
 *                                    ↘ EXPIRED        ↘ DISCONNECTED ↗                ↘ REPORT_FAILED → REPORT_GENERATING
 *                                                     ↘ PAUSED → IN_PROGRESS
 *                              (any non-terminal) → CANCELLED
 */

// Keep in sync with prisma InterviewStatus enum
type InterviewStatus =
  | "CREATED"
  | "PLAN_GENERATED"
  | "PENDING"
  | "IN_PROGRESS"
  | "PAUSED"
  | "DISCONNECTED"
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
  IN_PROGRESS: ["COMPLETED", "DISCONNECTED", "PAUSED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  DISCONNECTED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
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

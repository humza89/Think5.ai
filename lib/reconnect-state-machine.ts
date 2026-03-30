/**
 * Reconnect State Machine — Enforced transitions for fail-closed reconnect
 *
 * States: DISCONNECTED → RECOVERY_PENDING → RECOVERY_CONFIRMED → SOCKET_OPEN → LIVE
 * Hard gate: RECOVERY_PENDING → SOCKET_OPEN is INVALID (must go through RECOVERY_CONFIRMED)
 * Terminal: FAILED — requires page refresh to reset
 */

export type ReconnectState =
  | "DISCONNECTED"
  | "RECOVERY_PENDING"
  | "RECOVERY_CONFIRMED"
  | "SOCKET_OPEN"
  | "LIVE"
  | "FAILED";

const VALID_TRANSITIONS: Record<ReconnectState, ReconnectState[]> = {
  DISCONNECTED: ["RECOVERY_PENDING", "FAILED"],
  RECOVERY_PENDING: ["RECOVERY_CONFIRMED", "FAILED"],
  RECOVERY_CONFIRMED: ["SOCKET_OPEN", "FAILED"],
  SOCKET_OPEN: ["LIVE", "FAILED"],
  LIVE: ["DISCONNECTED", "FAILED"],
  FAILED: [], // terminal
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: ReconnectState, to: ReconnectState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition between reconnect states.
 * Throws if the transition is invalid — this is intentional for fail-closed enforcement.
 */
export function transitionReconnectState(from: ReconnectState, to: ReconnectState): ReconnectState {
  if (!isValidTransition(from, to)) {
    const msg = `[ReconnectSM] INVALID transition: ${from} → ${to}`;
    console.error(msg);
    throw new Error(msg);
  }
  return to;
}

export type ReconnectPhase = "checking" | "restoring" | "verifying" | "recovering" | "re-synced" | "resume-failed" | "recovery-failed" | "recovery-rate-limited" | null;

/**
 * Map ReconnectState to legacy reconnectPhase for backward compatibility with UI components.
 */
export function stateToPhase(state: ReconnectState): ReconnectPhase {
  switch (state) {
    case "DISCONNECTED": return null;
    case "RECOVERY_PENDING": return "recovering";
    case "RECOVERY_CONFIRMED": return "restoring";
    case "SOCKET_OPEN": return "verifying";
    case "LIVE": return "re-synced";
    case "FAILED": return "recovery-failed";
    default: return null;
  }
}

/** Configurable max recovery attempts before hard failure */
export const MAX_RECOVERY_ATTEMPTS = parseInt(
  typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS || "3" : "3",
  10,
);

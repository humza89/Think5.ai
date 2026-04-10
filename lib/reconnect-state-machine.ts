/**
 * Reconnect State Machine — Enforced transitions for fail-closed reconnect
 *
 * States: DISCONNECTED → RECOVERY_PENDING → RECOVERY_CONFIRMED → SOCKET_OPEN → LIVE
 * Hard gate: RECOVERY_PENDING → SOCKET_OPEN is INVALID (must go through RECOVERY_CONFIRMED)
 * Terminal: FAILED — requires page refresh to reset
 */

import { logger } from "@/lib/logger";

export type ReconnectState =
  | "DISCONNECTED"
  | "RECOVERY_PENDING"
  | "RECOVERY_CONFIRMED"
  | "SOCKET_OPEN"
  | "CONTEXT_VERIFIED"
  | "LIVE"
  | "FAILED"
  | "RATE_LIMITED";

const VALID_TRANSITIONS: Record<ReconnectState, ReconnectState[]> = {
  DISCONNECTED: ["RECOVERY_PENDING", "RATE_LIMITED", "FAILED"],
  RECOVERY_PENDING: ["RECOVERY_CONFIRMED", "FAILED"],
  RECOVERY_CONFIRMED: ["SOCKET_OPEN", "FAILED"],
  SOCKET_OPEN: ["CONTEXT_VERIFIED", "LIVE", "FAILED"], // Fix 4: CONTEXT_VERIFIED required when atomic reconnect enabled
  CONTEXT_VERIFIED: ["LIVE", "FAILED"], // Fix 4: verified context hash → can go live
  LIVE: ["DISCONNECTED", "FAILED"],
  RATE_LIMITED: ["RECOVERY_PENDING", "FAILED"], // CF4: Can retry after cooldown or fail permanently
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
    logger.error(msg);
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
    case "CONTEXT_VERIFIED": return "verifying";
    case "LIVE": return "re-synced";
    case "RATE_LIMITED": return "recovery-rate-limited";
    case "FAILED": return "recovery-failed";
    default: return null;
  }
}

/**
 * Configurable max recovery attempts before hard failure.
 *
 * Phase 1.2: default raised from 3 → 10 to match relay MAX_GEMINI_RECONNECTS.
 * A mismatch made the client give up (and fall back to text) while the relay was
 * still happily reconnecting to Gemini — producing unnecessary degraded experiences.
 */
export const MAX_RECOVERY_ATTEMPTS = parseInt(
  typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS || "10" : "10",
  10,
);

/** CF4: Rapid-reconnect rate-limit — max cycles within window before throttling */
export const RATE_LIMIT_MAX_CYCLES = 3;
export const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds

/**
 * Check whether reconnect timestamps indicate rate-limiting is needed.
 * Returns true if `RATE_LIMIT_MAX_CYCLES` or more reconnects occurred within `RATE_LIMIT_WINDOW_MS`.
 */
export function shouldRateLimit(timestamps: number[], now: number = Date.now()): boolean {
  const recentCount = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS).length;
  return recentCount >= RATE_LIMIT_MAX_CYCLES;
}

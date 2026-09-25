/**
 * Relay drain handling (Phase 0 T11, Step 4) — pure decision helpers shared by
 * the voice hook and its chaos tests.
 *
 * During a Fly rolling deploy the relay sends `{ type: "relay.draining",
 * drainMs }` before closing every socket with 1001. The browser should treat
 * that close as a planned restart: reconnect almost immediately (the
 * surviving machine is already serving), do not count the cycle toward the
 * rapid-reconnect rate limit, and keep the normal exponential backoff for
 * unplanned closes.
 */

export interface RelayDrainingFrame {
  type: "relay.draining";
  reason?: string;
  drainMs?: number;
  timestamp?: number;
}

export const DRAIN_GRACE_MS = 5_000;
export const DRAIN_RECONNECT_MIN_MS = 250;
export const DRAIN_RECONNECT_JITTER_MS = 500;

export function isRelayDrainingFrame(data: unknown): data is RelayDrainingFrame {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "relay.draining";
}

/** When a draining notice stops being relevant to a subsequent close event. */
export function drainingUntil(frame: RelayDrainingFrame, now: number = Date.now()): number {
  const drainMs = typeof frame.drainMs === "number" && frame.drainMs > 0 ? frame.drainMs : 10_000;
  return now + drainMs + DRAIN_GRACE_MS;
}

export interface ReconnectPlanInput {
  closeCode: number;
  /** From `drainingUntil`, or 0 when no draining notice was received. */
  drainingUntil: number;
  attempt: number;
  now?: number;
  random?: () => number;
}

export interface ReconnectPlan {
  kind: "deploy_restart" | "unplanned";
  delayMs: number;
  /** Whether this cycle counts toward the rapid-reconnect rate limit. */
  countsTowardRateLimit: boolean;
}

/**
 * Decide how to reconnect after a socket close. A close that follows a
 * draining notice (within its window) is a planned restart: near-immediate
 * reconnect with a little jitter so N clients do not stampede the surviving
 * machine, exempt from the rate limit. Everything else keeps the existing
 * exponential backoff capped at 10 s.
 */
export function planReconnect(input: ReconnectPlanInput): ReconnectPlan {
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  if (input.drainingUntil > 0 && now <= input.drainingUntil) {
    return {
      kind: "deploy_restart",
      delayMs: Math.round(DRAIN_RECONNECT_MIN_MS + random() * DRAIN_RECONNECT_JITTER_MS),
      countsTowardRateLimit: false,
    };
  }
  const base = 1000;
  const delay = Math.min(base * Math.pow(2, input.attempt) + random() * base, 10_000);
  return { kind: "unplanned", delayMs: Math.round(delay), countsTowardRateLimit: true };
}

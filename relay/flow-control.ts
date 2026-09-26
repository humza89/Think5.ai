/**
 * Application-level backpressure for the relay's per-session message buffer.
 *
 * Salvaged from legacy PRs #11 (Track 7, Task 27: slow/pause ladder) and #1
 * (Phase 1.5: surface buffer drops instead of failing silently). While the
 * upstream Gemini socket is connecting or reconnecting, client frames are
 * queued in a bounded buffer; once it overflows, audio is dropped. The relay
 * tells the client how full the buffer is so it can throttle BEFORE that:
 *
 *   normal  utilisation < 50 %  — send at full rate
 *   slow    50 % – 80 %          — send every other audio frame
 *   pause   ≥ 80 %               — stop sending audio until "normal" again
 *
 * Frame: { type: "relay.flow", level, bufferUtilization, droppedThisSession, timestamp }
 *
 * Pure helpers, shared by the relay and its tests. The client-side mirror is
 * lib/relay-flow.ts.
 */

export type FlowLevel = "normal" | "slow" | "pause";

export const FLOW_SLOW_THRESHOLD = 0.5;
export const FLOW_PAUSE_THRESHOLD = 0.8;

export interface RelayFlowFrame {
  type: "relay.flow";
  level: FlowLevel;
  /** 0..1 share of the session buffer in use. */
  bufferUtilization: number;
  /** Messages dropped on overflow so far in this session. */
  droppedThisSession: number;
  timestamp: number;
}

export function bufferUtilization(buffered: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.min(1, Math.max(0, buffered / limit));
}

export function flowLevelFor(buffered: number, limit: number): FlowLevel {
  const utilization = bufferUtilization(buffered, limit);
  if (utilization >= FLOW_PAUSE_THRESHOLD) return "pause";
  if (utilization >= FLOW_SLOW_THRESHOLD) return "slow";
  return "normal";
}

export function buildFlowFrame(
  level: FlowLevel,
  buffered: number,
  limit: number,
  droppedThisSession: number,
  now: number = Date.now(),
): RelayFlowFrame {
  return {
    type: "relay.flow",
    level,
    bufferUtilization: bufferUtilization(buffered, limit),
    droppedThisSession,
    timestamp: now,
  };
}

export interface RelayDegradedFrame {
  type: "relay.degraded";
  reason: "provider_circuit_open";
  /** How long the client should expect the provider to stay unavailable. */
  cooldownMs: number;
  breakerState: "OPEN" | "HALF_OPEN" | "CLOSED";
  timestamp: number;
}

export function buildDegradedFrame(
  breakerState: RelayDegradedFrame["breakerState"],
  cooldownMs: number,
  now: number = Date.now(),
): RelayDegradedFrame {
  return { type: "relay.degraded", reason: "provider_circuit_open", cooldownMs, breakerState, timestamp: now };
}

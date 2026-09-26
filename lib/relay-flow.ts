/**
 * Relay backpressure and provider-degradation frames — client-side mirror of
 * relay/flow-control.ts (the relay cannot import from lib/, and lib/ must not
 * import the relay's runtime code across the control-plane boundary).
 *
 * `relay.flow` tells the browser how full the relay's per-session buffer is
 * while the upstream provider is (re)connecting:
 *   normal — send audio at full rate
 *   slow   — send every other audio frame
 *   pause  — drop outbound audio until the relay says "normal" again
 *
 * `relay.degraded` tells the browser the relay's provider circuit breaker is
 * open: the voice provider is known to be down for roughly `cooldownMs`, so
 * the room should show degraded connection quality rather than a generic
 * timeout. Reconnect handling itself is unchanged.
 */

export type RelayFlowLevel = "normal" | "slow" | "pause";

export interface RelayFlowFrame {
  type: "relay.flow";
  level: RelayFlowLevel;
  bufferUtilization?: number;
  droppedThisSession?: number;
  timestamp?: number;
}

export interface RelayDegradedFrame {
  type: "relay.degraded";
  reason?: string;
  cooldownMs?: number;
  breakerState?: string;
  timestamp?: number;
}

const FLOW_LEVELS: ReadonlySet<string> = new Set(["normal", "slow", "pause"]);

export function isRelayFlowFrame(data: unknown): data is RelayFlowFrame {
  if (typeof data !== "object" || data === null) return false;
  const d = data as { type?: unknown; level?: unknown };
  return d.type === "relay.flow" && typeof d.level === "string" && FLOW_LEVELS.has(d.level);
}

export function isRelayDegradedFrame(data: unknown): data is RelayDegradedFrame {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "relay.degraded";
}

/**
 * Whether the n-th outbound audio frame should be sent under a flow level.
 * `frameIndex` is a per-connection counter incremented for every frame the
 * processor produces; "slow" sends the even ones.
 */
export function shouldSendAudioFrame(level: RelayFlowLevel, frameIndex: number): boolean {
  switch (level) {
    case "pause":
      return false;
    case "slow":
      return frameIndex % 2 === 0;
    default:
      return true;
  }
}

/**
 * lib/relay-flow — client-side frame guards and the audio throttle decision.
 */

import { describe, expect, it } from "vitest";
import { isRelayDegradedFrame, isRelayFlowFrame, shouldSendAudioFrame } from "@/lib/relay-flow";

describe("frame guards", () => {
  it("recognises relay.flow with a known level only", () => {
    expect(isRelayFlowFrame({ type: "relay.flow", level: "slow", bufferUtilization: 0.6 })).toBe(true);
    expect(isRelayFlowFrame({ type: "relay.flow", level: "turbo" })).toBe(false);
    expect(isRelayFlowFrame({ type: "relay.flow" })).toBe(false);
    expect(isRelayFlowFrame({ serverContent: {} })).toBe(false);
    expect(isRelayFlowFrame(null)).toBe(false);
  });

  it("recognises relay.degraded", () => {
    expect(isRelayDegradedFrame({ type: "relay.degraded", reason: "provider_circuit_open", cooldownMs: 30_000 })).toBe(true);
    expect(isRelayDegradedFrame({ type: "relay.draining" })).toBe(false);
  });
});

describe("shouldSendAudioFrame", () => {
  it("sends everything at normal", () => {
    for (let i = 0; i < 10; i++) expect(shouldSendAudioFrame("normal", i)).toBe(true);
  });

  it("sends every other frame at slow", () => {
    const sent = Array.from({ length: 10 }, (_, i) => shouldSendAudioFrame("slow", i));
    expect(sent).toEqual([true, false, true, false, true, false, true, false, true, false]);
  });

  it("sends nothing at pause", () => {
    for (let i = 0; i < 10; i++) expect(shouldSendAudioFrame("pause", i)).toBe(false);
  });
});

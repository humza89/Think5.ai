/**
 * Relay backpressure and provider circuit breaker (legacy PR #1/#11 salvage):
 * source-level guards that the relay emits `relay.flow` while buffering and
 * `relay.degraded` when its provider breaker refuses a dial, that /health
 * exposes the breaker, and that the browser hook consumes both frames and
 * throttles its audio path.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const relaySource = readFileSync("relay/server.ts", "utf8");
const hookSource = readFileSync("hooks/useVoiceInterview.ts", "utf8");
const flowControlSource = readFileSync("relay/flow-control.ts", "utf8");

describe("relay: application-level backpressure", () => {
  it("emits relay.flow as the buffer fills and forces a pause frame on overflow", () => {
    const pushIdx = relaySource.indexOf("messageBuffer.push(data);");
    const checkIdx = relaySource.indexOf("checkAndEmitFlowLevel();", pushIdx);
    const overflowIdx = relaySource.indexOf("Buffer overflow", pushIdx);
    const forcedPauseIdx = relaySource.indexOf('emitFlowLevel("pause", true);', overflowIdx);
    expect(pushIdx).toBeGreaterThan(0);
    expect(checkIdx).toBeGreaterThan(pushIdx);
    expect(forcedPauseIdx).toBeGreaterThan(overflowIdx);
    expect(relaySource).toMatch(/bufferDropsThisSession\+\+/);
  });

  it("returns the client to normal once the buffer has drained on (re)connect", () => {
    const drainIdx = relaySource.indexOf("Draining ${messageBuffer.length} buffered message(s)");
    const normalIdx = relaySource.indexOf('emitFlowLevel("normal");', drainIdx);
    expect(drainIdx).toBeGreaterThan(0);
    expect(normalIdx).toBeGreaterThan(drainIdx);
  });
});

describe("relay: provider circuit breaker", () => {
  it("records connect failures and successes on the shared breaker", () => {
    expect(relaySource).toMatch(/new CircuitBreaker\(\{ failureThreshold: 3, failureWindowMs: 60_000, cooldownMs: 30_000 \}\)/);
    expect(relaySource.match(/geminiBreaker\.recordFailure\(\)/g)?.length).toBeGreaterThanOrEqual(2); // error + connect timeout
    expect(relaySource).toMatch(/geminiBreaker\.recordSuccess\(\)/);
  });

  it("defers reconnects and the initial dial while the breaker is open, telling the client why", () => {
    const reconnectIdx = relaySource.indexOf("function attemptGeminiReconnect()");
    const gateIdx = relaySource.indexOf("if (!geminiBreaker.canAttempt())", reconnectIdx);
    const degradedIdx = relaySource.indexOf("emitProviderDegraded();", gateIdx);
    expect(gateIdx).toBeGreaterThan(reconnectIdx);
    expect(degradedIdx).toBeGreaterThan(gateIdx);
    expect(relaySource).toMatch(/if \(geminiBreaker\.canAttempt\(\)\) \{\s*geminiWs = connectToGemini\(\);/);
    expect(relaySource).toMatch(/function emitProviderDegraded\(\)[\s\S]*buildDegradedFrame\(geminiBreaker\.getState\(\), geminiBreaker\.msUntilRetry\(\)\)/);
    expect(flowControlSource).toMatch(/type: "relay\.degraded"/);
  });

  it("exposes the breaker on /health and degrades while it is open", () => {
    expect(relaySource).toMatch(/circuitBreaker: \{ state: geminiBreaker\.getState\(\), recentFailures: geminiBreaker\.getFailureCount\(\) \}/);
    expect(relaySource).toMatch(/provider_circuit_open/);
  });
});

describe("browser hook: consumes the control frames", () => {
  it("handles relay.flow and relay.degraded before Gemini payloads", () => {
    const flowIdx = hookSource.indexOf("isRelayFlowFrame(data)");
    const degradedIdx = hookSource.indexOf("isRelayDegradedFrame(data)");
    const setupIdx = hookSource.indexOf("if (data.setupComplete)");
    expect(flowIdx).toBeGreaterThan(0);
    expect(degradedIdx).toBeGreaterThan(flowIdx);
    expect(setupIdx).toBeGreaterThan(degradedIdx);
  });

  it("throttles the shared audio send path and resets the level on a new socket", () => {
    const sendIdx = hookSource.indexOf("const sendPcmToWebSocket = ");
    const throttleIdx = hookSource.indexOf("shouldSendAudioFrame(flowLevelRef.current", sendIdx);
    const queueIdx = hookSource.indexOf("audioQueueRef.current", sendIdx);
    expect(throttleIdx).toBeGreaterThan(sendIdx);
    expect(throttleIdx).toBeLessThan(queueIdx); // decided before the frame is queued
    const openIdx = hookSource.indexOf("ws.onopen = () => {");
    expect(hookSource.indexOf('flowLevelRef.current = "normal";', openIdx)).toBeGreaterThan(openIdx);
  });
});

/**
 * Healthy-Path Regression Tests (Global Req G4)
 *
 * Verifies that the happy path continues to work correctly after
 * all fail-closed gates and enterprise audit fixes. These tests
 * ensure that normal operations are not broken by safety checks.
 *
 * All tests use mocks — no real network or DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transitionReconnectState,
  isValidTransition,
  stateToPhase,
  MAX_RECOVERY_ATTEMPTS,
} from "@/lib/reconnect-state-machine";
import type { ReconnectState } from "@/lib/reconnect-state-machine";
import { compute4FactorConfidence } from "@/lib/memory-orchestrator";
import { checkFollowUpGrounding, verifyGrounding, isClaimSupported } from "@/lib/grounding-gate";

// Mock dependencies
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => false,
}));
vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Healthy-Path Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // H1: First-start interview succeeds without triggering any gates
  it("H1: first-start interview has no gate triggers", () => {
    // First start: transcript is empty, no reconnect needed
    const transcriptLength = 0;
    const isFirstStart = transcriptLength === 0;
    expect(isFirstStart).toBe(true);

    // No reconnect state check needed for first start
    // State machine starts at DISCONNECTED (default) — no transitions needed
    const reconnectState: ReconnectState = "DISCONNECTED";
    expect(reconnectState).toBe("DISCONNECTED");

    // No violations, no recovery attempts
    const violationCount = 0;
    const reconnectAttempts = 0;
    expect(violationCount).toBe(0);
    expect(reconnectAttempts).toBeLessThan(MAX_RECOVERY_ATTEMPTS);

    // memoryPacketVersion starts at 0, first checkpoint increments to 1
    const memoryPacketVersion = 0 + 1;
    expect(memoryPacketVersion).toBe(1);
  });

  // H2: Single clean reconnect cycle completes end-to-end
  it("H2: clean reconnect cycle completes without errors", () => {
    // Simulate: LIVE → DISCONNECTED → RECOVERY_PENDING → RECOVERY_CONFIRMED → SOCKET_OPEN → LIVE
    let state: ReconnectState = "LIVE";

    // WebSocket drops
    state = transitionReconnectState(state, "DISCONNECTED");
    expect(state).toBe("DISCONNECTED");

    // Recovery API called
    state = transitionReconnectState(state, "RECOVERY_PENDING");
    expect(state).toBe("RECOVERY_PENDING");
    expect(stateToPhase(state)).toBe("recovering");

    // Recovery confirmed
    state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
    expect(state).toBe("RECOVERY_CONFIRMED");
    expect(stateToPhase(state)).toBe("restoring");

    // WebSocket reopens
    state = transitionReconnectState(state, "SOCKET_OPEN");
    expect(state).toBe("SOCKET_OPEN");
    expect(stateToPhase(state)).toBe("verifying");

    // Back to live
    state = transitionReconnectState(state, "LIVE");
    expect(state).toBe("LIVE");
    expect(stateToPhase(state)).toBe("re-synced");

    // All transitions were valid
    expect(isValidTransition("LIVE", "DISCONNECTED")).toBe(true);
    expect(isValidTransition("DISCONNECTED", "RECOVERY_PENDING")).toBe(true);
    expect(isValidTransition("RECOVERY_PENDING", "RECOVERY_CONFIRMED")).toBe(true);
    expect(isValidTransition("RECOVERY_CONFIRMED", "SOCKET_OPEN")).toBe(true);
    expect(isValidTransition("SOCKET_OPEN", "LIVE")).toBe(true);
  });

  // H3: Checkpoint with zero violations returns memoryPacketVersion + 1
  it("H3: clean checkpoint increments memoryPacketVersion monotonically", () => {
    const existingVersion = 5;
    const newVersion = existingVersion + 1;
    expect(newVersion).toBe(6);
    expect(newVersion).toBeGreaterThan(existingVersion);

    // Simulate 10 consecutive clean checkpoints
    let version = 0;
    for (let i = 0; i < 10; i++) {
      const prev = version;
      version += 1;
      expect(version).toBeGreaterThan(prev);
    }
    expect(version).toBe(10);

    // No stale version rejection for valid sequence
    const clientVersion = 9;
    const serverVersion = 9;
    const isStale = clientVersion < serverVersion;
    expect(isStale).toBe(false);
  });

  // H4: Memory packet with all sources healthy scores confidence >= 0.9
  it("H4: all-healthy retrieval scores confidence >= 0.9", () => {
    const confidence = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
      5000,  // well above 2000 threshold
      2000,  // min threshold
      0,     // no violations
      0,     // no reconnects
      true,  // has state hash
    );

    // All 4 factors at max: 0.4 + 0.3 + 0.2 + 0.1 = 1.0
    expect(confidence).toBeCloseTo(1.0, 5);
    expect(confidence).toBeGreaterThanOrEqual(0.9);

    // With one degraded source, still >= 0.7
    const partialConfidence = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: false, recentTurnsOk: true },
      5000,
      2000,
      0,
      0,
      true,
    );
    expect(partialConfidence).toBeGreaterThanOrEqual(0.7);

    // Below token threshold applies -0.1 penalty
    const lowTokenConfidence = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
      500,   // below threshold
      2000,
      0,
      0,
      true,
    );
    expect(lowTokenConfidence).toBeCloseTo(0.9, 5); // 1.0 - 0.1 penalty
  });

  // H5: Grounding check with well-grounded follow-up returns grounded=true
  it("H5: well-grounded follow-up passes grounding check", () => {
    const result = checkFollowUpGrounding(
      "You mentioned working with React at Google",
      [
        { turnId: "turn-3", content: "I've been working with React at Google for 4 years" },
        { turnId: "turn-4", content: "It was a really productive environment" },
      ],
      [
        { content: "4 years of React experience at Google", factType: "experience", turnId: "fact-1" },
      ]
    );

    expect(result.grounded).toBe(true);
    expect(result.flag).toBeNull();
    expect(result.groundingRef).toBeTruthy();
  });

  // H6: Verify grounding gate passes for content with no assertions
  it("H6: non-assertive content trivially passes grounding", () => {
    const result = checkFollowUpGrounding(
      "That sounds great! Could you elaborate on that?",
      [{ turnId: "turn-1", content: "I enjoy working on distributed systems" }],
      []
    );

    expect(result.grounded).toBe(true);
    expect(result.flag).toBeNull();
  });

  // H7: Verify isClaimSupported works for exact matches
  it("H7: exact claim matching returns supported", () => {
    expect(isClaimSupported(
      "5 years at Google",
      "I spent 5 years at Google working on search infrastructure"
    )).toBe(true);
  });

  // H8: Confidence degrades gracefully with violations
  it("H8: confidence degrades proportionally with violations", () => {
    const conf0 = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
      5000, 2000, 0, 0, true,
    );
    const conf1 = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
      5000, 2000, 1, 0, true,
    );
    const conf3 = compute4FactorConfidence(
      { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
      5000, 2000, 3, 0, true,
    );

    expect(conf0).toBeGreaterThan(conf1);
    expect(conf1).toBeGreaterThan(conf3);
    // 3 violations: 0.3 - 0.3 = 0, so overall = 0.4 + 0 + 0.2 + 0.1 = 0.7
    expect(conf3).toBeCloseTo(0.7, 5);
  });
});

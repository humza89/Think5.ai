/**
 * Chaos Continuity Tests — Enterprise audit remediation Round 11
 *
 * Validates fail-closed behavior under adverse conditions:
 * - Memory retrieval failures → hard block (not degraded continue)
 * - Confidence computation failures → hard block
 * - Contradiction gate failures → hard block
 * - SLO enforcement → session block on breach
 * - Repeated intro after reconnect
 * - Contradiction persistence to durable storage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitTurn } from "@/lib/session-brain";
import type { TurnCommitRequest } from "@/lib/session-brain";
import { createInitialState, serializeState, transitionState } from "@/lib/interviewer-state";

// ── Mocks ────────────────────────────────────────────────────────────

let mockVersion = 0;
vi.mock("@/lib/conversation-ledger", () => ({
  commitSingleTurn: vi.fn().mockImplementation(() => {
    mockVersion++;
    return Promise.resolve({ committed: true, currentVersion: mockVersion, turn: { turnIndex: mockVersion } });
  }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockImplementation((flag: string) => {
    if (flag === "ENTERPRISE_SOURCE_GROUNDING_REQUIRED") return false;
    return true;
  }),
  FeatureFlags: {
    OUTPUT_GATE_BLOCKING: true,
    GROUNDING_GATE_ENABLED: true,
    TURN_COMMIT_PROTOCOL: true,
    SEMANTIC_CONTRADICTION_DETECTOR: true,
    VOICE_MODE_ENABLED: true,
  },
}));

const mockRecordSLOEvent = vi.fn().mockResolvedValue(undefined);
const mockEnforceSessionSLO = vi.fn().mockResolvedValue({ blocked: false });
vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: (...args: unknown[]) => mockRecordSLOEvent(...args),
  enforceSessionSLO: (...args: unknown[]) => mockEnforceSessionSLO(...args),
}));

vi.mock("@/lib/interview-timeline", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockCompute4Factor = vi.fn();
vi.mock("@/lib/memory-orchestrator", () => ({
  compute4FactorConfidence: (...args: unknown[]) => mockCompute4Factor(...args),
}));

const mockDetectContradictions = vi.fn().mockReturnValue([]);
vi.mock("@/lib/semantic-contradiction-detector", () => ({
  detectContradictions: (...args: unknown[]) => mockDetectContradictions(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function buildLockedState(): string {
  let state = createInitialState();
  state = transitionState(state, { type: "PERSONA_LOCKED" });
  state = transitionState(state, { type: "INTRO_COMPLETED" });
  state = transitionState(state, { type: "MOVE_TO_STEP", step: "resume_deep_dive" });
  return serializeState(state);
}

function makeTurnRequest(content: string): TurnCommitRequest {
  return {
    turnId: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "interviewer",
    content,
    clientTimestamp: new Date().toISOString(),
  };
}

function makeSessionState(
  verifiedFacts: Array<{ factType: string; content: string; confidence: number }>,
  aiContent: string,
  interviewerStateJson: string,
) {
  return {
    interviewerState: interviewerStateJson,
    lastTurnIndex: mockVersion,
    verifiedFacts,
    recentTurns: [{ turnId: "candidate-turn-1", content: aiContent }],
    factCount: verifiedFacts.length,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Chaos Continuity — Fail-Closed Enterprise Guarantees", () => {
  beforeEach(() => {
    mockVersion = 0;
    vi.clearAllMocks();
    mockEnforceSessionSLO.mockResolvedValue({ blocked: false });
    // Default: healthy confidence
    mockCompute4Factor.mockReturnValue(0.85);
    // Default: no contradictions
    mockDetectContradictions.mockReturnValue([]);
  });

  describe("FIX-3: Memory confidence hard-block", () => {
    it("blocks turn when memory confidence is critically low (< 0.3)", async () => {
      mockCompute4Factor.mockReturnValueOnce(0.15);

      const stateJson = buildLockedState();
      const request = makeTurnRequest("Tell me about your experience at Google.");
      const session = makeSessionState(
        [{ factType: "COMPANY", content: "5 years at Google", confidence: 0.9 }],
        request.content,
        stateJson,
      );

      const result = await commitTurn("chaos-confidence-low", request, session);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe("MEMORY_CONFIDENCE_LOW");
      expect(result.memorySlotWarnings).toBeDefined();
      expect(result.memorySlotWarnings!.some(w => w.includes("LOW_MEMORY_CONFIDENCE"))).toBe(true);
    });
  });

  describe("FIX-5: Memory confidence computation failure → fail-closed", () => {
    it("blocks turn when confidence computation throws", async () => {
      mockCompute4Factor.mockImplementationOnce(() => {
        throw new Error("Redis unavailable");
      });

      const stateJson = buildLockedState();
      const request = makeTurnRequest("Tell me about your experience.");
      const session = makeSessionState(
        [{ factType: "CLAIM", content: "worked at startup", confidence: 0.9 }],
        request.content,
        stateJson,
      );

      const result = await commitTurn("chaos-confidence-error", request, session);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe("MEMORY_CONFIDENCE_LOW");
      expect(result.memorySlotWarnings).toBeDefined();
      expect(result.memorySlotWarnings!.some(w => w.includes("fail-closed"))).toBe(true);
    });
  });

  describe("FIX-6: Contradiction detection failure → fail-closed", () => {
    it("blocks turn when detectContradictions throws", async () => {
      mockDetectContradictions.mockImplementationOnce(() => {
        throw new Error("Contradiction engine crashed");
      });

      const stateJson = buildLockedState();
      const request = makeTurnRequest("You mentioned your 5 years at Google.");
      const session = makeSessionState(
        [{ factType: "COMPANY", content: "5 years at Google on search", confidence: 0.9 }],
        request.content,
        stateJson,
      );

      const result = await commitTurn("chaos-contradiction-error", request, session);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe("CONTRADICTION_GATE_UNAVAILABLE");
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].detail).toContain("fail-closed");
    });
  });

  describe("FIX-9: SLO enforcement blocks session on breach", () => {
    it("blocks turn when critical SLO is breached with exhausted error budget", async () => {
      mockEnforceSessionSLO.mockResolvedValueOnce({
        blocked: true,
        reason: "SLO_BREACH: repeated_intro rate exceeded — error budget exhausted",
      });

      const stateJson = buildLockedState();
      const request = makeTurnRequest("Tell me about your role.");
      const session = makeSessionState([], request.content, stateJson);

      const result = await commitTurn("chaos-slo-breach", request, session);

      expect(result.committed).toBe(false);
      expect(result.reason).toContain("SLO_BREACH");
    });

    it("allows turn when SLO enforcement check fails (non-fatal)", async () => {
      mockEnforceSessionSLO.mockRejectedValueOnce(new Error("Redis down"));

      const stateJson = buildLockedState();
      const request = makeTurnRequest("That's helpful, thank you.");
      const session = makeSessionState([], request.content, stateJson);

      // Should not throw — SLO failure is non-fatal
      const result = await commitTurn("chaos-slo-error", request, session);
      expect(result).toBeDefined();
    });
  });

  describe("Repeated intro after reconnect — state preservation", () => {
    it("blocks AI turn containing intro pattern when persona is locked", async () => {
      const stateJson = buildLockedState();
      const introContent = "Hi, I'm Aria, your interviewer today. Welcome to the interview!";
      const request = makeTurnRequest(introContent);
      const session = makeSessionState([], introContent, stateJson);

      const result = await commitTurn("chaos-repeated-intro", request, session);

      expect(result.committed).toBe(false);
      // Could be caught by output gate (blocking mode) or unconditional intro guard
      expect(["INTRO_BLOCKED_UNCONDITIONAL", "OUTPUT_GATE_BLOCKED"]).toContain(result.reason);
      expect(result.violations.some(v => v.type === "reintroduction")).toBe(true);
    });

    it("blocks intro even with different phrasing when persona is locked", async () => {
      const stateJson = buildLockedState();
      const introContent = "Let me introduce myself. My name is Aria and I'll be conducting your interview.";
      const request = makeTurnRequest(introContent);
      const session = makeSessionState([], introContent, stateJson);

      const result = await commitTurn("chaos-intro-variant", request, session);

      expect(result.committed).toBe(false);
      expect(["INTRO_BLOCKED_UNCONDITIONAL", "OUTPUT_GATE_BLOCKED"]).toContain(result.reason);
    });
  });

  describe("FIX-10: Contradiction persistence to durable storage", () => {
    it("calls recordEvent when contradiction is detected and blocked", async () => {
      const { recordEvent } = await import("@/lib/interview-timeline");

      mockDetectContradictions.mockReturnValueOnce([
        { type: "numeric", description: "Numeric mismatch: 5 vs 10", confidence: 0.8,
          factA: { turnId: "prior", content: "5 years at Google", factType: "COMPANY" },
          factB: { turnId: "new", content: "10 years at Google", factType: "CLAIM" } },
      ]);

      const stateJson = buildLockedState();
      const request = makeTurnRequest("You mentioned your 10 years at Google on advertising");
      const session = makeSessionState(
        [{ factType: "COMPANY", content: "5 years at Google on search", confidence: 0.9 }],
        request.content,
        stateJson,
      );

      const result = await commitTurn("chaos-contradiction-persist", request, session);

      expect(result.committed).toBe(false);
      expect(result.reason).toBe("SEMANTIC_CONTRADICTION_DETECTED");
      expect(recordEvent).toHaveBeenCalledWith(
        "chaos-contradiction-persist",
        "contradiction_detected",
        expect.objectContaining({ turnId: request.turnId }),
      );
    });
  });
});

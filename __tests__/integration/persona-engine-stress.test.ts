/**
 * REM-5: State-Locked Persona Engine — Stress Tests
 *
 * Verifies that the persona engine state machine survives 20 rapid
 * reconnects without state drift, blocks all intro attempts after
 * persona lock, preserves follow-up priority across serialization
 * boundaries, and produces deterministic state hashes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInitialState,
  transitionState,
  serializeState,
  deserializeState,
  computeStateHash,
  getNextFollowUp,
} from "@/lib/interviewer-state";
import type { InterviewerState } from "@/lib/interviewer-state";
import { commitTurn } from "@/lib/session-brain";
import type { TurnCommitRequest } from "@/lib/session-brain";

// ── Mocks ─────────────────────────────────────────────────────────────

let mockVersion = 0;

vi.mock("@/lib/conversation-ledger", () => ({
  commitSingleTurn: vi.fn().mockImplementation(() => {
    mockVersion++;
    return Promise.resolve({
      committed: true,
      currentVersion: mockVersion,
      turn: { turnIndex: mockVersion },
    });
  }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockImplementation((flag: string) => {
    // Disable output gate blocking so the unconditional intro guard fires
    if (flag === "OUTPUT_GATE_BLOCKING") return false;
    return true;
  }),
  FeatureFlags: {},
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function buildLockedState(): InterviewerState {
  let state = createInitialState();
  state = transitionState(state, { type: "PERSONA_LOCKED" });
  state = transitionState(state, { type: "INTRO_COMPLETED" });
  return state;
}

function buildRichState(): InterviewerState {
  let state = buildLockedState();

  // 5 questions
  for (let i = 1; i <= 5; i++) {
    state = transitionState(state, {
      type: "QUESTION_ASKED",
      questionHash: `q-${i}`,
    });
  }

  // 3 follow-ups
  for (let i = 1; i <= 3; i++) {
    state = transitionState(state, {
      type: "FOLLOW_UP_FLAGGED",
      item: { topic: `topic${i}`, reason: "reason", priority: "high" },
    });
  }

  // 2 commitments
  for (let i = 1; i <= 2; i++) {
    state = transitionState(state, {
      type: "COMMITMENT_MADE",
      commitment: { id: `c-${i}`, description: "desc", turnId: `turn-${i}` },
    });
  }

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("REM-5: State-Locked Persona Engine — Stress", () => {
  beforeEach(() => {
    mockVersion = 0;
  });

  // ── Test 1: 20-reconnect stress with state preservation ───────────

  describe("20-reconnect stress test with state preservation", () => {
    it("preserves all state fields across 20 serialize/deserialize cycles", () => {
      const original = buildRichState();
      const originalHash = original.stateHash;

      for (let reconnect = 1; reconnect <= 20; reconnect++) {
        const json = serializeState(original);
        const restored = deserializeState(json);

        expect(restored.personaLocked).toBe(true);
        expect(restored.introDone).toBe(true);
        expect(restored.askedQuestionIds).toHaveLength(5);
        expect(restored.followupQueue).toHaveLength(3);
        expect(restored.commitments).toHaveLength(2);
        expect(restored.stateHash).toBe(originalHash);
        expect(restored.currentStep).toBe(original.currentStep);
        expect(restored.activePersonaMode).toBe(original.activePersonaMode);

        // Verify the recomputed hash matches the stored hash
        const recomputedHash = computeStateHash(restored);
        expect(recomputedHash).toBe(originalHash);
      }
    });

    it("accumulates state correctly through chained reconnects", () => {
      let state = buildRichState();
      const originalHash = state.stateHash;

      for (let reconnect = 1; reconnect <= 20; reconnect++) {
        const json = serializeState(state);
        state = deserializeState(json);
      }

      // After 20 chained round-trips, state must be identical
      expect(state.personaLocked).toBe(true);
      expect(state.introDone).toBe(true);
      expect(state.askedQuestionIds).toHaveLength(5);
      expect(state.followupQueue).toHaveLength(3);
      expect(state.commitments).toHaveLength(2);
      expect(state.stateHash).toBe(originalHash);
      expect(state.currentStep).toBe("candidate_intro");
      expect(state.activePersonaMode).toBe("interviewer");
    });
  });

  // ── Test 2: 20 intro attempts all blocked ─────────────────────────

  describe("20 intro attempts all blocked after persona lock", () => {
    it("rejects all 20 intro attempts with INTRO_BLOCKED_UNCONDITIONAL", async () => {
      const lockedState = buildLockedState();
      const serializedState = serializeState(lockedState);

      const introContent =
        "Hi, I'm Aria, and I'll be conducting your interview today.";

      for (let attempt = 1; attempt <= 20; attempt++) {
        const request: TurnCommitRequest = {
          turnId: `intro-attempt-${attempt}`,
          role: "model",
          content: introContent,
        };

        const result = await commitTurn("interview-stress-1", request, {
          interviewerState: serializedState,
          lastTurnIndex: attempt,
          verifiedFacts: [],
          recentTurns: [],
        });

        expect(result.committed).toBe(false);
        expect(result.reason).toBe("INTRO_BLOCKED_UNCONDITIONAL");
      }
    });
  });

  // ── Test 3: Follow-up persistence across reconnects ───────────────

  describe("follow-up persistence across reconnects", () => {
    it("preserves follow-ups with correct priorities after reconnect", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      state = transitionState(state, { type: "INTRO_COMPLETED" });

      // Add follow-ups at simulated turns with different priorities
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: {
          topic: "turn5-topic",
          reason: "flagged at turn 5",
          priority: "high",
          turnId: "turn-5",
        },
      });
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: {
          topic: "turn10-topic",
          reason: "flagged at turn 10",
          priority: "medium",
          turnId: "turn-10",
        },
      });
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: {
          topic: "turn15-topic",
          reason: "flagged at turn 15",
          priority: "low",
          turnId: "turn-15",
        },
      });

      // Simulate reconnect
      const json = serializeState(state);
      const restored = deserializeState(json);

      // All 3 follow-ups present
      expect(restored.followupQueue).toHaveLength(3);
      expect(restored.followupQueue[0].priority).toBe("high");
      expect(restored.followupQueue[1].priority).toBe("medium");
      expect(restored.followupQueue[2].priority).toBe("low");

      // getNextFollowUp returns highest priority first
      const next = getNextFollowUp(restored);
      expect(next).not.toBeNull();
      expect(next!.topic).toBe("turn5-topic");
      expect(next!.priority).toBe("high");
    });

    it("returns follow-ups in priority order regardless of insertion order", () => {
      let state = createInitialState();

      // Insert in reverse priority order: low, medium, high
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "low-first", reason: "test", priority: "low" },
      });
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "medium-second", reason: "test", priority: "medium" },
      });
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "high-third", reason: "test", priority: "high" },
      });

      // Reconnect
      const restored = deserializeState(serializeState(state));

      const next = getNextFollowUp(restored);
      expect(next).not.toBeNull();
      expect(next!.topic).toBe("high-third");
      expect(next!.priority).toBe("high");
    });
  });

  // ── Test 4: State hash determinism ────────────────────────────────

  describe("state hash determinism", () => {
    it("produces identical hashes for independently built identical states", () => {
      // Build the same state sequence twice, completely independently
      const stateA = buildRichState();
      const stateB = buildRichState();

      expect(stateA.stateHash).toBe(stateB.stateHash);
    });

    it("produces different hashes for divergent states", () => {
      const stateA = buildRichState();

      let stateB = buildRichState();
      stateB = transitionState(stateB, {
        type: "QUESTION_ASKED",
        questionHash: "q-extra",
      });

      expect(stateA.stateHash).not.toBe(stateB.stateHash);
    });

    it("hash is stable across serialize/deserialize", () => {
      const state = buildRichState();
      const hash1 = state.stateHash;

      const restored = deserializeState(serializeState(state));
      const hash2 = computeStateHash(restored);

      expect(hash1).toBe(hash2);
    });
  });
});

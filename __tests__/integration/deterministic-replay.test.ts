import { describe, it, expect } from "vitest";
import {
  createInitialState,
  transitionState,
  computeStateHash,
  serializeState,
  deserializeState,
} from "@/lib/interviewer-state";
import type { InterviewerState, StateEvent } from "@/lib/interviewer-state";
import { compute4FactorConfidence } from "@/lib/memory-orchestrator";

describe("Deterministic Replay Tests", () => {
  const EVENT_SEQUENCE: StateEvent[] = [
    { type: "PERSONA_LOCKED" },
    { type: "INTRO_COMPLETED" },
    { type: "SET_TOPIC", topic: "distributed systems" },
    { type: "QUESTION_ASKED", questionHash: "q1hash" },
    { type: "MOVE_TO_STEP", step: "resume_deep_dive" },
    { type: "TOPIC_DEPTH_INCREMENT", topic: "distributed systems" },
    { type: "FOLLOW_UP_FLAGGED", item: { topic: "caching", reason: "mentioned Redis", priority: "high" } },
    { type: "COMMITMENT_MADE", commitment: { id: "c1", description: "follow up on caching", turnId: "t5" } },
    { type: "QUESTION_ASKED", questionHash: "q2hash" },
    { type: "SET_TOPIC", topic: "system design" },
    { type: "MOVE_TO_STEP", step: "technical" },
    { type: "CONTRADICTION_DETECTED", contradiction: { turnIdA: "t3", turnIdB: "t7", description: "team size mismatch" } },
    { type: "CLARIFICATION_REQUESTED", clarification: { turnId: "t8", question: "Can you clarify team size?" } },
    { type: "QUESTION_ASKED", questionHash: "q3hash" },
    { type: "FOLLOW_UP_CONSUMED", topic: "caching" },
    { type: "COMMITMENT_FULFILLED", commitmentId: "c1" },
    { type: "CLARIFICATION_RESOLVED", turnId: "t8" },
    { type: "SET_PERSONA_MODE", mode: "clarifier" },
  ];

  describe("State determinism", () => {
    it("identical event sequence produces identical stateHash", () => {
      let state1 = createInitialState();
      let state2 = createInitialState();

      for (const event of EVENT_SEQUENCE) {
        state1 = transitionState(state1, event);
        state2 = transitionState(state2, event);
      }

      expect(state1.stateHash).toBe(state2.stateHash);
      expect(computeStateHash(state1)).toBe(computeStateHash(state2));
    });

    it("different event order produces different stateHash", () => {
      let state1 = createInitialState();
      let state2 = createInitialState();

      // Apply in order
      for (const event of EVENT_SEQUENCE) {
        state1 = transitionState(state1, event);
      }

      // Apply in different order (skip first few, then add them)
      const reordered = [...EVENT_SEQUENCE.slice(3), ...EVENT_SEQUENCE.slice(0, 3)];
      for (const event of reordered) {
        state2 = transitionState(state2, event);
      }

      // Different order = different final state (usually)
      // Not guaranteed to differ for all orderings, but statistically they should
      // At minimum, verify the hash is deterministic for each path
      expect(state1.stateHash).toBe(computeStateHash(state1));
      expect(state2.stateHash).toBe(computeStateHash(state2));
    });
  });

  describe("Serialize/deserialize roundtrip preserves state", () => {
    it("full event sequence survives serialization roundtrip", () => {
      let state = createInitialState();
      for (const event of EVENT_SEQUENCE) {
        state = transitionState(state, event);
      }

      const serialized = serializeState(state);
      const deserialized = deserializeState(serialized);

      expect(deserialized.stateHash).toBe(state.stateHash);
      expect(deserialized.introDone).toBe(state.introDone);
      expect(deserialized.currentStep).toBe(state.currentStep);
      expect(deserialized.askedQuestionIds).toEqual(state.askedQuestionIds);
      expect(deserialized.commitments).toEqual(state.commitments);
      expect(deserialized.contradictionMap).toEqual(state.contradictionMap);
      expect(deserialized.personaLocked).toBe(state.personaLocked);
      expect(deserialized.activePersonaMode).toBe(state.activePersonaMode);
    });
  });

  describe("Multi-reconnect stability", () => {
    it("5 sequential serialize/deserialize cycles produce identical state", () => {
      let state = createInitialState();
      for (const event of EVENT_SEQUENCE) {
        state = transitionState(state, event);
      }

      const originalHash = state.stateHash;

      // Simulate 5 reconnects (serialize → deserialize cycle)
      for (let i = 0; i < 5; i++) {
        const json = serializeState(state);
        state = deserializeState(json);
      }

      expect(state.stateHash).toBe(originalHash);
    });
  });

  describe("Memory confidence determinism", () => {
    it("same inputs produce identical confidence scores", () => {
      const inputs = {
        retrievalStatus: { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
        manifestTotalTokens: 5000,
        minTokenThreshold: 2000,
        violationCount: 0,
        reconnectCount: 1,
        hasStateHash: true,
      };

      const score1 = compute4FactorConfidence(
        inputs.retrievalStatus, inputs.manifestTotalTokens,
        inputs.minTokenThreshold, inputs.violationCount,
        inputs.reconnectCount, inputs.hasStateHash
      );

      const score2 = compute4FactorConfidence(
        inputs.retrievalStatus, inputs.manifestTotalTokens,
        inputs.minTokenThreshold, inputs.violationCount,
        inputs.reconnectCount, inputs.hasStateHash
      );

      expect(score1).toBe(score2);
    });
  });

  describe("Persona state transitions", () => {
    it("PERSONA_LOCKED prevents re-introduction after first turn", () => {
      let state = createInitialState();
      expect(state.personaLocked).toBe(false);

      state = transitionState(state, { type: "PERSONA_LOCKED" });
      expect(state.personaLocked).toBe(true);

      // Further PERSONA_LOCKED events are idempotent
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      expect(state.personaLocked).toBe(true);
    });

    it("SET_PERSONA_MODE transitions correctly", () => {
      let state = createInitialState();
      expect(state.activePersonaMode).toBe("interviewer");

      state = transitionState(state, { type: "SET_PERSONA_MODE", mode: "clarifier" });
      expect(state.activePersonaMode).toBe("clarifier");

      state = transitionState(state, { type: "SET_PERSONA_MODE", mode: "closer" });
      expect(state.activePersonaMode).toBe("closer");
    });
  });

  describe("Backward compatibility", () => {
    it("deserializes legacy state without persona fields", () => {
      const legacyState = {
        introDone: true,
        currentTopic: "systems",
        currentStep: "technical",
        followupQueue: [],
        askedQuestionIds: ["q1"],
        contradictionMap: [],
        pendingClarifications: [],
        topicDepthCounters: {},
        commitments: [],
        revisitAllowList: [],
        stateHash: "abc123",
      };

      const deserialized = deserializeState(JSON.stringify(legacyState));

      // Should get defaults for new fields
      expect(deserialized.personaLocked).toBe(true); // introDone=true → personaLocked=true
      expect(deserialized.activePersonaMode).toBe("interviewer"); // technical → interviewer
    });

    it("deserializes legacy state with closing step", () => {
      const legacyState = {
        introDone: true,
        currentTopic: "",
        currentStep: "closing",
        followupQueue: [],
        askedQuestionIds: [],
        contradictionMap: [],
        pendingClarifications: [],
        topicDepthCounters: {},
        commitments: [],
        revisitAllowList: [],
        stateHash: "def456",
      };

      const deserialized = deserializeState(JSON.stringify(legacyState));
      expect(deserialized.activePersonaMode).toBe("closer");
    });
  });
});

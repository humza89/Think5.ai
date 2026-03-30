import { describe, it, expect } from "vitest";
import {
  createInitialState,
  transitionState,
  computeStateHash,
  hashQuestion,
  isQuestionAsked,
  getNextFollowUp,
  isTopicExhausted,
  isStepSkip,
  serializeState,
  deserializeState,
} from "@/lib/interviewer-state";

describe("Interviewer State Machine", () => {
  describe("createInitialState", () => {
    it("creates state with all default values", () => {
      const state = createInitialState();
      expect(state.introDone).toBe(false);
      expect(state.currentStep).toBe("opening");
      expect(state.currentTopic).toBe("");
      expect(state.followupQueue).toHaveLength(0);
      expect(state.askedQuestionIds).toHaveLength(0);
      expect(state.contradictionMap).toHaveLength(0);
      expect(state.stateHash).toBeTruthy();
    });

    it("produces consistent hash for same initial state", () => {
      const a = createInitialState();
      const b = createInitialState();
      expect(a.stateHash).toBe(b.stateHash);
    });
  });

  describe("transitionState", () => {
    it("INTRO_COMPLETED sets introDone and advances step", () => {
      const state = createInitialState();
      const next = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(next.introDone).toBe(true);
      expect(next.currentStep).toBe("candidate_intro");
    });

    it("INTRO_COMPLETED does not change step if not opening", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "MOVE_TO_STEP", step: "technical" });
      const next = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(next.introDone).toBe(true);
      expect(next.currentStep).toBe("technical");
    });

    it("MOVE_TO_STEP updates current step", () => {
      const state = createInitialState();
      const next = transitionState(state, { type: "MOVE_TO_STEP", step: "behavioral" });
      expect(next.currentStep).toBe("behavioral");
    });

    it("SET_TOPIC updates current topic", () => {
      const state = createInitialState();
      const next = transitionState(state, { type: "SET_TOPIC", topic: "system design" });
      expect(next.currentTopic).toBe("system design");
    });

    it("QUESTION_ASKED adds hash and deduplicates", () => {
      const state = createInitialState();
      const s1 = transitionState(state, { type: "QUESTION_ASKED", questionHash: "abc123" });
      expect(s1.askedQuestionIds).toContain("abc123");
      const s2 = transitionState(s1, { type: "QUESTION_ASKED", questionHash: "abc123" });
      expect(s2.askedQuestionIds.filter((id) => id === "abc123")).toHaveLength(1);
    });

    it("FOLLOW_UP_FLAGGED and CONSUMED work correctly", () => {
      let state = createInitialState();
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "concurrency", reason: "mentioned mutex", priority: "high" },
      });
      expect(state.followupQueue).toHaveLength(1);
      state = transitionState(state, { type: "FOLLOW_UP_CONSUMED", topic: "concurrency" });
      expect(state.followupQueue).toHaveLength(0);
    });

    it("CONTRADICTION_DETECTED adds to map", () => {
      const state = createInitialState();
      const next = transitionState(state, {
        type: "CONTRADICTION_DETECTED",
        contradiction: { turnIdA: "t1", turnIdB: "t5", description: "said 3 years then 5 years" },
      });
      expect(next.contradictionMap).toHaveLength(1);
    });

    it("TOPIC_DEPTH_INCREMENT caps at 3", () => {
      let state = createInitialState();
      for (let i = 0; i < 5; i++) {
        state = transitionState(state, { type: "TOPIC_DEPTH_INCREMENT", topic: "react" });
      }
      expect(state.topicDepthCounters["react"]).toBe(3);
    });

    it("produces different hash after transition", () => {
      const state = createInitialState();
      const next = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(next.stateHash).not.toBe(state.stateHash);
    });

    it("is deterministic: same state + event = same result", () => {
      const state = createInitialState();
      const a = transitionState(state, { type: "INTRO_COMPLETED" });
      const b = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(a.stateHash).toBe(b.stateHash);
      expect(a.introDone).toBe(b.introDone);
      expect(a.currentStep).toBe(b.currentStep);
    });
  });

  describe("computeStateHash", () => {
    it("excludes stateHash from computation", () => {
      const state = createInitialState();
      const hash1 = computeStateHash(state);
      const modified = { ...state, stateHash: "different" };
      const hash2 = computeStateHash(modified);
      expect(hash1).toBe(hash2);
    });

    it("changes when state changes", () => {
      const state = createInitialState();
      const modified = { ...state, introDone: true };
      expect(computeStateHash(state)).not.toBe(computeStateHash(modified));
    });
  });

  describe("hashQuestion", () => {
    it("normalizes case and whitespace", () => {
      expect(hashQuestion("What is your experience?")).toBe(
        hashQuestion("  what   is  your  experience  ")
      );
    });

    it("strips punctuation", () => {
      expect(hashQuestion("What's your experience?")).toBe(
        hashQuestion("whats your experience")
      );
    });

    it("produces 12-char hex string", () => {
      const hash = hashQuestion("test question");
      expect(hash).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  describe("isQuestionAsked", () => {
    it("detects asked question", () => {
      let state = createInitialState();
      const hash = hashQuestion("Tell me about your experience");
      state = transitionState(state, { type: "QUESTION_ASKED", questionHash: hash });
      expect(isQuestionAsked(state, "Tell me about your experience")).toBe(true);
      expect(isQuestionAsked(state, "What are your strengths?")).toBe(false);
    });
  });

  describe("getNextFollowUp", () => {
    it("returns highest priority first", () => {
      let state = createInitialState();
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "low-pri", reason: "test", priority: "low" },
      });
      state = transitionState(state, {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "high-pri", reason: "test", priority: "high" },
      });
      expect(getNextFollowUp(state)?.topic).toBe("high-pri");
    });

    it("returns null when queue empty", () => {
      expect(getNextFollowUp(createInitialState())).toBeNull();
    });
  });

  describe("isTopicExhausted", () => {
    it("returns true after 3 increments", () => {
      let state = createInitialState();
      for (let i = 0; i < 3; i++) {
        state = transitionState(state, { type: "TOPIC_DEPTH_INCREMENT", topic: "react" });
      }
      expect(isTopicExhausted(state, "react")).toBe(true);
      expect(isTopicExhausted(state, "vue")).toBe(false);
    });
  });

  describe("isStepSkip", () => {
    it("detects step skips", () => {
      expect(isStepSkip("opening", "technical")).toBe(true);
      expect(isStepSkip("opening", "candidate_intro")).toBe(false);
      expect(isStepSkip("technical", "behavioral")).toBe(false);
    });
  });

  describe("serialize/deserialize", () => {
    it("round-trips correctly", () => {
      const state = createInitialState();
      const json = serializeState(state);
      const restored = deserializeState(json);
      expect(restored.stateHash).toBe(state.stateHash);
      expect(restored.introDone).toBe(state.introDone);
    });

    it("throws on invalid JSON", () => {
      expect(() => deserializeState('{"introDone": "not-bool"}')).toThrow();
    });
  });
});

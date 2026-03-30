import { describe, it, expect } from "vitest";
import {
  createInitialState,
  transitionState,
  computeStateHash,
  serializeState,
  deserializeState,
} from "@/lib/interviewer-state";
import type { StateEvent } from "@/lib/interviewer-state";
import { extractFactsImmediate, isContradiction } from "@/lib/fact-extractor";
import { verifyGrounding, extractAssertions, isClaimSupported } from "@/lib/grounding-gate";
import { checkOutputGate, checkOutputGateWithAction } from "@/lib/output-gate";
import { hashQuestion } from "@/lib/interviewer-state";

describe("Chaos & Resilience Tests", () => {
  describe("reconnect storm (rapid state transitions)", () => {
    it("handles 10 rapid INTRO_COMPLETED events without corruption", () => {
      let state = createInitialState();

      // Simulate 10 rapid reconnect attempts each firing INTRO_COMPLETED
      for (let i = 0; i < 10; i++) {
        state = transitionState(state, { type: "INTRO_COMPLETED" });
      }

      // introDone should be true (idempotent)
      expect(state.introDone).toBe(true);
      // Should have moved to candidate_intro on first event, stayed there
      expect(state.currentStep).toBe("candidate_intro");
      expect(state.stateHash).toBeTruthy();
    });

    it("handles rapid step transitions without backward regression", () => {
      let state = createInitialState();
      const steps: Array<{ type: "MOVE_TO_STEP"; step: any }> = [
        { type: "MOVE_TO_STEP", step: "technical" },
        { type: "MOVE_TO_STEP", step: "opening" },      // backward — rejected
        { type: "MOVE_TO_STEP", step: "behavioral" },
        { type: "MOVE_TO_STEP", step: "technical" },     // backward — rejected
        { type: "MOVE_TO_STEP", step: "domain" },
        { type: "MOVE_TO_STEP", step: "candidate_intro" }, // backward — rejected
        { type: "MOVE_TO_STEP", step: "closing" },
        { type: "MOVE_TO_STEP", step: "opening" },      // backward — rejected
        { type: "MOVE_TO_STEP", step: "closing" },       // same — allowed
        { type: "MOVE_TO_STEP", step: "closing" },       // same — allowed
      ];

      for (const event of steps) {
        state = transitionState(state, event);
      }

      expect(state.currentStep).toBe("closing");
    });
  });

  describe("concurrent checkpoint + state integrity", () => {
    it("state hash changes on every meaningful transition", () => {
      const hashes = new Set<string>();
      let state = createInitialState();
      hashes.add(state.stateHash);

      const events: StateEvent[] = [
        { type: "INTRO_COMPLETED" },
        { type: "SET_TOPIC", topic: "architecture" },
        { type: "QUESTION_ASKED", questionHash: "q1" },
        { type: "MOVE_TO_STEP", step: "technical" },
        { type: "FOLLOW_UP_FLAGGED", item: { topic: "scaling", reason: "interesting", priority: "high" } },
        { type: "CONTRADICTION_DETECTED", contradiction: { turnIdA: "t1", turnIdB: "t2", description: "mismatch" } },
        { type: "COMMITMENT_MADE", commitment: { id: "c1", description: "test", turnId: "t1" } },
        { type: "COMMITMENT_FULFILLED", commitmentId: "c1" },
      ];

      for (const event of events) {
        state = transitionState(state, event);
        hashes.add(state.stateHash);
      }

      // Each meaningful transition should produce a new hash.
      // Most events change state, but some may collide (e.g., commitment fulfilled
      // when the commitment object was already in the array). We verify that at least
      // most transitions produce unique hashes.
      expect(hashes.size).toBeGreaterThanOrEqual(events.length); // at least N unique hashes
    });

    it("serialize/deserialize preserves hash across checkpoint boundary", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      state = transitionState(state, { type: "SET_TOPIC", topic: "systems" });
      state = transitionState(state, { type: "QUESTION_ASKED", questionHash: "q1" });

      const serialized = serializeState(state);
      const deserialized = deserializeState(serialized);

      expect(deserialized.stateHash).toBe(state.stateHash);
      expect(computeStateHash(deserialized)).toBe(state.stateHash);
    });
  });

  describe("long session (200 turns)", () => {
    it("state hash valid after 200 question events", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      state = transitionState(state, { type: "MOVE_TO_STEP", step: "technical" });

      for (let i = 0; i < 200; i++) {
        state = transitionState(state, {
          type: "QUESTION_ASKED",
          questionHash: `question_hash_${i}`,
        });
        if (i % 10 === 0) {
          state = transitionState(state, {
            type: "TOPIC_DEPTH_INCREMENT",
            topic: `topic_${Math.floor(i / 10)}`,
          });
        }
      }

      expect(state.askedQuestionIds).toHaveLength(200);
      expect(state.stateHash).toBeTruthy();
      expect(state.stateHash.length).toBe(16); // SHA-256 truncated to 16 hex chars

      // Verify hash is deterministic
      const recomputedHash = computeStateHash(state);
      expect(recomputedHash).toBe(state.stateHash);
    });

    it("topic depth capped at 3 even with 200 increments", () => {
      let state = createInitialState();
      for (let i = 0; i < 200; i++) {
        state = transitionState(state, {
          type: "TOPIC_DEPTH_INCREMENT",
          topic: "deep_topic",
        });
      }
      expect(state.topicDepthCounters["deep_topic"]).toBe(3);
    });
  });

  describe("fact extraction resilience", () => {
    it("handles empty content without errors", () => {
      const facts = extractFactsImmediate({
        turnId: "t1",
        role: "candidate",
        content: "",
      });
      expect(facts).toHaveLength(0);
    });

    it("handles very long content without timeout", () => {
      const longContent = "I worked at Google. ".repeat(1000) + "I managed 50 engineers.";
      const facts = extractFactsImmediate({
        turnId: "t1",
        role: "candidate",
        content: longContent,
      });
      // Should extract facts without crashing
      expect(Array.isArray(facts)).toBe(true);
    });

    it("only extracts from candidate turns", () => {
      const facts = extractFactsImmediate({
        turnId: "t1",
        role: "interviewer",
        content: "You mentioned 50 engineers at Google.",
      });
      expect(facts).toHaveLength(0);
    });
  });

  describe("contradiction detection resilience", () => {
    it("does not false-positive on same-turn facts", () => {
      const fact = {
        turnId: "t1",
        factType: "METRIC" as const,
        content: "reduced latency by 40%",
        confidence: 0.9,
        extractedBy: "immediate",
      };
      expect(isContradiction(fact, fact)).toBe(false);
    });

    it("detects actual contradiction (different numbers, same context)", () => {
      const factA = {
        turnId: "t1",
        factType: "METRIC" as const,
        content: "reduced latency by 40%",
        confidence: 0.9,
        extractedBy: "immediate",
      };
      const factB = {
        turnId: "t5",
        factType: "METRIC" as const,
        content: "reduced latency by 10%",
        confidence: 0.9,
        extractedBy: "immediate",
      };
      expect(isContradiction(factA, factB)).toBe(true);
    });

    it("does not flag non-overlapping facts as contradictions", () => {
      const factA = {
        turnId: "t1",
        factType: "METRIC" as const,
        content: "improved throughput by 200%",
        confidence: 0.9,
        extractedBy: "immediate",
      };
      const factB = {
        turnId: "t5",
        factType: "METRIC" as const,
        content: "reduced costs by 30%",
        confidence: 0.9,
        extractedBy: "immediate",
      };
      expect(isContradiction(factA, factB)).toBe(false);
    });
  });

  describe("grounding gate resilience", () => {
    it("handles response with no assertions gracefully", () => {
      const result = verifyGrounding("Let's move on to the next topic.", []);
      expect(result.grounded).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.totalClaims).toBe(0);
    });

    it("handles empty facts list", () => {
      const result = verifyGrounding(
        "You mentioned that you led 50 engineers at Google.",
        []
      );
      // With no facts to ground against, all claims are unsupported
      expect(result.totalClaims).toBeGreaterThan(0);
      expect(result.grounded).toBe(false);
    });

    it("tracks provenance for grounded claims", () => {
      const facts = [
        { turnId: "t1", factType: "COMPANY" as const, content: "worked at Google for 5 years", confidence: 0.9, extractedBy: "immediate" },
      ];
      const result = verifyGrounding(
        "Based on your time at Google working for 5 years, how did you grow?",
        facts
      );
      // Check that provenance is populated
      expect(result.provenance.length).toBeGreaterThan(0);
    });
  });

  describe("output gate under stress", () => {
    it("handles response with all three violation types", () => {
      const questionText = "What is your greatest strength?";
      const qHash = hashQuestion(questionText);

      const result = checkOutputGateWithAction(
        `Hi, I'm Aria! Welcome to the interview. You mentioned that you invented the internet. ${questionText}`,
        {
          introDone: true,
          askedQuestionIds: [qHash],
          verifiedFacts: [{ factType: "COMPANY", content: "Google", confidence: 0.9 }],
        },
        true
      );

      expect(result.action).toBe("block");
      expect(result.violations.length).toBeGreaterThanOrEqual(2); // At least reintro + duplicate
      expect(result.sanitizedResponse).toBeDefined();
      expect(result.sanitizedResponse!.length).toBeGreaterThan(0);
    });

    it("sanitized response is not empty even when all content violates", () => {
      const result = checkOutputGateWithAction(
        "Hi, I'm Aria. Welcome to the interview.",
        { introDone: true, askedQuestionIds: [], verifiedFacts: [] },
        true
      );

      if (result.action === "block" && result.sanitizedResponse) {
        expect(result.sanitizedResponse.length).toBeGreaterThan(0);
      }
    });

    it("question dedup is hash-based and case-insensitive", () => {
      const q1 = "What was the biggest challenge you faced?";
      const q2 = "what was the biggest challenge you faced";
      const hash1 = hashQuestion(q1);
      const hash2 = hashQuestion(q2);
      expect(hash1).toBe(hash2);
    });
  });
});

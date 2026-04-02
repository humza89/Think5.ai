import { describe, it, expect } from "vitest";
import {
  checkOutputGate,
  checkOutputGateWithAction,
  sanitizeResponse,
} from "@/lib/output-gate";
import type { OutputGateInput } from "@/lib/output-gate";
import { hashQuestion } from "@/lib/interviewer-state";
import {
  createInitialState,
  transitionState,
  serializeState,
} from "@/lib/interviewer-state";

describe("Output Gate Integration — Ledger Replacement & Semantic Dedup", () => {
  describe("pre-write blocking replaces AI content", () => {
    it("sanitized response differs from original when re-intro is blocked", () => {
      const input: OutputGateInput = {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [],
      };

      const original = "Hi, I'm Aria. Welcome to the interview. Tell me about your experience with distributed systems?";
      const action = checkOutputGateWithAction(original, input, true);

      expect(action.action).toBe("block");
      expect(action.sanitizedResponse).toBeDefined();
      expect(action.sanitizedResponse).not.toBe(original);
      // Sanitized version should still contain the actual question
      expect(action.sanitizedResponse!).toContain("distributed systems");
    });

    it("sanitized response replaces duplicate question with transition", () => {
      const question = "What was the most challenging project you worked on?";
      const qHash = hashQuestion(question);

      const input: OutputGateInput = {
        introDone: true,
        askedQuestionIds: [qHash],
        verifiedFacts: [],
      };

      const original = `That's a great insight. ${question}`;
      const action = checkOutputGateWithAction(original, input, true);

      expect(action.action).toBe("block");
      expect(action.sanitizedResponse).toBeDefined();
      expect(action.sanitizedResponse!).toContain("Let me move on to the next topic");
      expect(action.sanitizedResponse!).not.toContain("most challenging project");
    });
  });

  describe("semantic duplicate detection", () => {
    it("detects paraphrased questions via Jaccard similarity", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [
          "What was the biggest challenge you faced at your previous company?",
        ],
        verifiedFacts: [],
      };

      // Paraphrased version of the same question
      const response = "Tell me about the biggest challenge you encountered at your previous company?";
      const result = checkOutputGate(response, input);

      expect(result.violations.some((v) => v.type === "duplicate_question")).toBe(true);
      expect(result.violations[0].detail).toContain("Semantic duplicate");
    });

    it("does not flag semantically distinct questions", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [
          "What was the biggest challenge you faced at your previous company?",
        ],
        verifiedFacts: [],
      };

      // Completely different question
      const response = "How do you approach system design for high-traffic applications?";
      const result = checkOutputGate(response, input);

      expect(result.violations.filter((v) => v.type === "duplicate_question")).toHaveLength(0);
    });

    it("skips semantic check when askedQuestionTexts is empty", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [],
        verifiedFacts: [],
      };

      const response = "What was the biggest challenge you faced?";
      const result = checkOutputGate(response, input);

      expect(result.passed).toBe(true);
    });
  });

  describe("revisit allow list", () => {
    it("allows duplicate question when hash is in revisitAllowList", () => {
      const question = "What was the biggest challenge you faced?";
      const qHash = hashQuestion(question);

      const input: OutputGateInput = {
        introDone: true,
        askedQuestionIds: [qHash],
        revisitAllowList: [qHash],
        verifiedFacts: [],
      };

      const result = checkOutputGate(`Let me revisit this: ${question}`, input);

      // Should NOT flag as duplicate because it's in the allow list
      expect(result.violations.filter((v) => v.type === "duplicate_question")).toHaveLength(0);
    });

    it("still flags duplicate when hash is NOT in revisitAllowList", () => {
      const question = "What was the biggest challenge you faced?";
      const qHash = hashQuestion(question);

      const input: OutputGateInput = {
        introDone: true,
        askedQuestionIds: [qHash],
        revisitAllowList: [],
        verifiedFacts: [],
      };

      // Use the exact question text so hash-exact match fires
      const result = checkOutputGate(`That's interesting. ${question}`, input);

      expect(result.violations.some((v) => v.type === "duplicate_question")).toBe(true);
    });
  });

  describe("commitment + revisit state machine integration", () => {
    it("REVISIT_QUESTION event adds hash to revisitAllowList", () => {
      let state = createInitialState();
      expect(state.revisitAllowList).toHaveLength(0);

      state = transitionState(state, {
        type: "REVISIT_QUESTION",
        questionHash: "abc123",
      });

      expect(state.revisitAllowList).toContain("abc123");
    });

    it("REVISIT_QUESTION is idempotent", () => {
      let state = createInitialState();

      state = transitionState(state, { type: "REVISIT_QUESTION", questionHash: "abc123" });
      state = transitionState(state, { type: "REVISIT_QUESTION", questionHash: "abc123" });

      expect(state.revisitAllowList).toHaveLength(1);
    });

    it("commitment detection patterns match expected AI text", () => {
      // Verify the patterns we use in the voice route would match
      const patterns = [
        /I'll\s+(?:ask|come back|follow up|return to|dig into|explore)\s+(.{5,80}?)(?:\.|,|$)/gi,
        /(?:we'll|let's)\s+(?:revisit|come back to|circle back to|return to)\s+(.{5,80}?)(?:\.|,|$)/gi,
        /I want to\s+(?:ask|explore|understand)\s+(?:more about\s+)?(.{5,80}?)(?:\.|,|$)/gi,
      ];

      const testCases = [
        { text: "I'll come back to your experience with Kubernetes later.", shouldMatch: true },
        { text: "Let's revisit your leadership approach in a moment.", shouldMatch: true },
        { text: "I want to explore more about your system design experience.", shouldMatch: true },
        { text: "We'll circle back to the scaling challenges you mentioned.", shouldMatch: true },
        { text: "Tell me about your experience.", shouldMatch: false },
      ];

      for (const tc of testCases) {
        let matched = false;
        for (const pattern of patterns) {
          pattern.lastIndex = 0; // Reset regex state
          if (pattern.test(tc.text)) {
            matched = true;
            break;
          }
        }
        expect(matched).toBe(tc.shouldMatch);
      }
    });
  });

  describe("bigram dedup detection", () => {
    it("detects reworded question via high word overlap (Level 1)", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [
          "What was the biggest challenge you faced at your previous company?",
        ],
        verifiedFacts: [],
      };

      // Paraphrased with high word overlap (>= 0.6 Jaccard)
      const response =
        "Tell me about the biggest challenge you encountered at your previous company?";
      const result = checkOutputGate(response, input);

      expect(
        result.violations.some((v) => v.type === "duplicate_question")
      ).toBe(true);
    });

    it("does not flag questions with low bigram and word overlap", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [
          "What was the biggest challenge you faced at your previous company?",
        ],
        verifiedFacts: [],
      };

      // Completely different topic — no meaningful overlap
      const response =
        "How do you approach designing APIs for high-throughput systems?";
      const result = checkOutputGate(response, input);

      expect(
        result.violations.filter((v) => v.type === "duplicate_question")
      ).toHaveLength(0);
    });

    it("catches duplicates via combined word+bigram threshold (Level 3)", () => {
      const input: OutputGateInput = {
        introDone: false,
        askedQuestionIds: [],
        askedQuestionTexts: [
          "How did you handle scaling challenges in distributed system architecture?",
        ],
        verifiedFacts: [],
      };

      // Shares key content tokens ("scaling", "challenges", "distributed", "system")
      // and bigrams like "scaling challenges", "distributed system"
      // word Jaccard ~0.5+, bigram overlap present
      const response =
        "What scaling challenges did you face in distributed system design?";
      const result = checkOutputGate(response, input);

      expect(
        result.violations.some((v) => v.type === "duplicate_question")
      ).toBe(true);
    });
  });

  describe("end-to-end blocking flow", () => {
    it("full flow: detect violation → sanitize → return corrected response", () => {
      // Simulate what the voice route does
      const preState = createInitialState();
      const stateAfterIntro = transitionState(preState, { type: "INTRO_COMPLETED" });

      const aiResponse = "Hi, I'm Aria! Thanks for joining. You mentioned that you built a quantum computer. What was your approach?";

      const gateAction = checkOutputGateWithAction(aiResponse, {
        introDone: stateAfterIntro.introDone,
        askedQuestionIds: stateAfterIntro.askedQuestionIds,
        verifiedFacts: [
          { factType: "COMPANY", content: "worked at Google", confidence: 0.9 },
        ],
      }, true);

      expect(gateAction.action).toBe("block");
      expect(gateAction.violations.length).toBeGreaterThan(0);
      expect(gateAction.sanitizedResponse).toBeDefined();

      // The sanitized response should NOT contain the re-introduction
      expect(gateAction.sanitizedResponse!.toLowerCase()).not.toMatch(/hi,?\s+i'?m\s+aria/i);
      expect(gateAction.sanitizedResponse!.toLowerCase()).not.toMatch(/thanks?\s+for\s+joining/i);

      // The sanitized response should still have meaningful content
      expect(gateAction.sanitizedResponse!.length).toBeGreaterThan(10);
    });
  });
});

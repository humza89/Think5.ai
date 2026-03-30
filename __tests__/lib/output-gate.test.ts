import { describe, it, expect } from "vitest";
import {
  checkOutputGate,
  checkOutputGateWithAction,
  sanitizeResponse,
} from "@/lib/output-gate";
import type { OutputGateInput, GateViolation } from "@/lib/output-gate";
import { hashQuestion } from "@/lib/interviewer-state";

const baseInput: OutputGateInput = {
  introDone: true,
  askedQuestionIds: [],
  verifiedFacts: [],
};

describe("Output Gate", () => {
  describe("checkOutputGate (warn-only)", () => {
    it("passes clean responses with no violations", () => {
      const result = checkOutputGate(
        "That's a great point about your experience. Can you tell me more about your team's architecture?",
        baseInput
      );
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("detects re-introduction after introDone", () => {
      const result = checkOutputGate(
        "Hi, I'm Aria and I'll be conducting your interview today. Let's start with your background.",
        baseInput
      );
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe("reintroduction");
      expect(result.violations[0].severity).toBe("warn");
    });

    it("does not flag intro when introDone is false", () => {
      const result = checkOutputGate(
        "Hi, I'm Aria and I'll be conducting your interview today.",
        { ...baseInput, introDone: false }
      );
      expect(result.passed).toBe(true);
    });

    it("detects duplicate questions", () => {
      const question = "What was the biggest challenge you faced at Google?";
      const qHash = hashQuestion(question);
      const result = checkOutputGate(
        `That's interesting. ${question}`,
        { ...baseInput, askedQuestionIds: [qHash] }
      );
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "duplicate_question")).toBe(true);
    });

    it("detects unsupported claims about candidate", () => {
      const result = checkOutputGate(
        "Earlier, you mentioned that you led a team of 50 engineers at SpaceX.",
        {
          ...baseInput,
          verifiedFacts: [
            { factType: "RESPONSIBILITY", content: "led a team of 10 engineers at Google", confidence: 0.9 },
          ],
        }
      );
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "unsupported_claim")).toBe(true);
    });

    it("passes when claims are supported by verified facts", () => {
      const result = checkOutputGate(
        "Based on your experience at Google leading a team of 10 engineers, how did you handle scaling?",
        {
          ...baseInput,
          verifiedFacts: [
            { factType: "RESPONSIBILITY", content: "led a team of 10 engineers at Google", confidence: 0.9 },
          ],
        }
      );
      // The assertion "experience at Google leading a team of 10 engineers" should be grounded
      expect(result.violations.filter((v) => v.type === "unsupported_claim")).toHaveLength(0);
    });
  });

  describe("checkOutputGateWithAction (blocking mode)", () => {
    it("returns pass action for clean responses", () => {
      const action = checkOutputGateWithAction(
        "Tell me about your approach to system design?",
        baseInput,
        true
      );
      expect(action.action).toBe("pass");
      expect(action.violations).toHaveLength(0);
      expect(action.sanitizedResponse).toBeUndefined();
    });

    it("blocks re-introduction in blocking mode", () => {
      const action = checkOutputGateWithAction(
        "Hi, I'm Aria. Welcome to the interview. What's your background?",
        baseInput,
        true
      );
      expect(action.action).toBe("block");
      expect(action.violations.length).toBeGreaterThan(0);
      expect(action.violations[0].severity).toBe("block");
      expect(action.sanitizedResponse).toBeDefined();
      // Sanitized response should not contain the intro
      expect(action.sanitizedResponse!.toLowerCase()).not.toMatch(/hi,?\s+i'?m\s+aria/i);
    });

    it("passes with violations in warn-only mode", () => {
      const action = checkOutputGateWithAction(
        "Hi, I'm Aria. Welcome to the interview.",
        baseInput,
        false // warn-only
      );
      expect(action.action).toBe("pass");
      expect(action.violations.length).toBeGreaterThan(0);
      expect(action.violations[0].severity).toBe("warn");
      expect(action.sanitizedResponse).toBeUndefined();
    });

    it("handles multiple violation types in a single response", () => {
      const question = "What motivates you in your work?";
      const qHash = hashQuestion(question);
      const action = checkOutputGateWithAction(
        `Thanks for joining! Earlier, you mentioned that you built a quantum computer at NASA. ${question}`,
        {
          introDone: true,
          askedQuestionIds: [qHash],
          verifiedFacts: [
            { factType: "COMPANY", content: "Google", confidence: 0.9 },
          ],
        },
        true
      );
      expect(action.action).toBe("block");
      // Should have at least reintroduction and duplicate question violations
      const types = action.violations.map((v) => v.type);
      expect(types).toContain("reintroduction");
      expect(types).toContain("duplicate_question");
    });
  });

  describe("sanitizeResponse", () => {
    it("strips intro sentences for reintroduction violations", () => {
      const violations: GateViolation[] = [
        { type: "reintroduction", detail: "test", severity: "block" },
      ];
      const result = sanitizeResponse(
        "Hi, I'm Aria. Let me introduce myself. Tell me about your experience.",
        violations
      );
      expect(result).not.toMatch(/Hi, I'm Aria/);
      expect(result).not.toMatch(/Let me introduce/);
      expect(result).toContain("Tell me about your experience");
    });

    it("replaces duplicate questions with transition marker", () => {
      const violations: GateViolation[] = [
        { type: "duplicate_question", detail: "test", severity: "block" },
      ];
      const result = sanitizeResponse(
        "That's great. What was the biggest challenge you faced?",
        violations
      );
      expect(result).toContain("Let me move on to the next topic");
      expect(result).not.toContain("What was the biggest challenge");
    });

    it("returns fallback if all content is stripped", () => {
      const violations: GateViolation[] = [
        { type: "reintroduction", detail: "test", severity: "block" },
      ];
      const result = sanitizeResponse("Hi, I'm Aria.", violations);
      expect(result).toBe("Let's continue with the interview.");
    });

    it("strips unsupported claim sentences", () => {
      const violations: GateViolation[] = [
        {
          type: "unsupported_claim",
          detail: 'Unsupported claim: "you worked at SpaceX for 10 years"',
          severity: "block",
        },
      ];
      const result = sanitizeResponse(
        "Based on what you told me, you worked at SpaceX for 10 years building rockets. That's impressive. What did you learn?",
        violations
      );
      expect(result).not.toMatch(/SpaceX/i);
      expect(result).toContain("What did you learn");
    });
  });
});

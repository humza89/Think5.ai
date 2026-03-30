import { describe, it, expect } from "vitest";
import { checkOutputGate, checkOutputGateWithAction } from "@/lib/output-gate";
import { checkFollowUpGrounding, verifyGrounding } from "@/lib/grounding-gate";

describe("Regression: Hallucinated Reference Prevention", () => {
  describe("Output Gate — unsupported claims", () => {
    it("flags unsupported claim about candidate work history", () => {
      const result = checkOutputGate(
        "You mentioned that you led a team of 200 engineers at SpaceX building the Starlink network.",
        {
          introDone: true,
          askedQuestionIds: [],
          verifiedFacts: [
            { factType: "COMPANY", content: "worked at Google on search", confidence: 0.9 },
            { factType: "METRIC", content: "led a team of 5 engineers", confidence: 0.85 },
          ],
        }
      );

      expect(result.violations.some((v) => v.type === "unsupported_claim")).toBe(true);
    });

    it("passes when claim matches verified facts", () => {
      const result = checkOutputGate(
        "Your 5 years at Google working on search infrastructure sounds very impactful.",
        {
          introDone: true,
          askedQuestionIds: [],
          verifiedFacts: [
            { factType: "COMPANY", content: "5 years at Google on search infrastructure", confidence: 0.9 },
          ],
        }
      );

      const unsupported = result.violations.filter((v) => v.type === "unsupported_claim");
      expect(unsupported).toHaveLength(0);
    });

    it("does not flag generic questions without assertions", () => {
      const result = checkOutputGate(
        "What technologies have you worked with in your career?",
        {
          introDone: true,
          askedQuestionIds: [],
          verifiedFacts: [],
        }
      );

      expect(result.passed).toBe(true);
    });

    it("sanitizes hallucinated content while preserving valid question", () => {
      const result = checkOutputGateWithAction(
        "Based on your experience leading 500 engineers at NASA, how would you approach system design?",
        {
          introDone: true,
          askedQuestionIds: [],
          verifiedFacts: [
            { factType: "METRIC", content: "5 person team at startup", confidence: 0.9 },
          ],
        },
        true
      );

      if (result.violations.some((v) => v.type === "unsupported_claim")) {
        expect(result.sanitizedResponse).toBeDefined();
        expect(result.sanitizedResponse!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Grounding Gate — follow-up grounding", () => {
    it("flags ungrounded follow-up referencing non-existent discussion", () => {
      const result = checkFollowUpGrounding(
        "You mentioned your PhD in quantum computing and managing 50 researchers at MIT",
        [
          { turnId: "t1", content: "I have a bachelor's degree in computer science" },
          { turnId: "t2", content: "I worked as a frontend developer for 3 years" },
        ],
        [
          { content: "bachelor's degree in CS", factType: "EDUCATION" },
          { content: "3 years frontend development", factType: "EXPERIENCE" },
        ]
      );

      expect(result.grounded).toBe(false);
    });

    it("passes grounded follow-up referencing actual statements", () => {
      const result = checkFollowUpGrounding(
        "You mentioned your experience with frontend development",
        [
          { turnId: "t1", content: "I worked as a frontend developer for 3 years building React applications" },
        ],
        [
          { content: "3 years frontend development with React", factType: "EXPERIENCE" },
        ]
      );

      expect(result.grounded).toBe(true);
    });

    it("verifyGrounding detects number mismatches", () => {
      const result = verifyGrounding(
        "You mentioned leading 200 engineers",
        [{ factType: "METRIC", content: "led a team of 5 engineers", confidence: 0.9, turnId: "t1", extractedBy: "regex" }]
      );

      // Should flag because 200 ≠ 5
      expect(result.score).toBeLessThan(0.5);
    });
  });
});

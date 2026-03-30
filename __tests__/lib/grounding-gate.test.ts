import { describe, it, expect } from "vitest";
import { extractAssertions, verifyGrounding } from "@/lib/grounding-gate";
import type { ExtractedFact } from "@/lib/fact-extractor";

describe("Grounding Gate", () => {
  describe("extractAssertions", () => {
    it("extracts 'you mentioned' references", () => {
      const assertions = extractAssertions("You mentioned that you led a team of 12 engineers at Google.");
      expect(assertions.length).toBeGreaterThanOrEqual(1);
      expect(assertions.some((a) => a.toLowerCase().includes("led a team"))).toBe(true);
    });

    it("extracts 'you said' references", () => {
      const assertions = extractAssertions("Earlier, you said that latency dropped by 50%.");
      expect(assertions.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts number claims", () => {
      const assertions = extractAssertions("Your 5 years of experience at Google is impressive.");
      expect(assertions.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts entity claims", () => {
      const assertions = extractAssertions("Your time at Meta sounds very productive.");
      expect(assertions.length).toBeGreaterThanOrEqual(1);
      expect(assertions.some((a) => a.toLowerCase().includes("meta"))).toBe(true);
    });

    it("returns empty for no assertions", () => {
      const assertions = extractAssertions("What technologies have you worked with?");
      expect(assertions).toHaveLength(0);
    });

    it("deduplicates identical assertions", () => {
      const assertions = extractAssertions(
        "You mentioned that you built a caching layer. You mentioned that you built a caching layer."
      );
      const unique = new Set(assertions);
      expect(assertions.length).toBe(unique.size);
    });
  });

  describe("verifyGrounding", () => {
    const makeFact = (content: string): ExtractedFact => ({
      turnId: "turn-1",
      factType: "CLAIM",
      content,
      confidence: 0.9,
      extractedBy: "immediate",
    });

    it("returns grounded=true when no assertions found", () => {
      const result = verifyGrounding("What else would you like to discuss?", []);
      expect(result.grounded).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.totalClaims).toBe(0);
    });

    it("verifies supported claims against facts", () => {
      const facts = [
        makeFact("I led a team of 12 engineers"),
        makeFact("worked at Google for 5 years"),
      ];
      const result = verifyGrounding(
        "You mentioned that you led a team of 12 engineers.",
        facts
      );
      expect(result.supportedClaims.length).toBeGreaterThanOrEqual(1);
    });

    it("flags unsupported claims", () => {
      const facts = [makeFact("I worked at Meta")];
      const result = verifyGrounding(
        "You mentioned that you spent 10 years at Amazon building distributed systems.",
        facts
      );
      expect(result.unsupportedClaims.length).toBeGreaterThanOrEqual(1);
      expect(result.grounded).toBe(false);
    });

    it("uses fuzzy matching for paraphrased claims", () => {
      const facts = [makeFact("managed a team of 15 backend engineers at Stripe")];
      const result = verifyGrounding(
        "You mentioned that you managed 15 engineers at Stripe.",
        facts
      );
      // Should find the claim supported via fuzzy match
      expect(result.score).toBeGreaterThan(0);
    });

    it("handles number-aware comparison", () => {
      const facts = [makeFact("reduced latency by 40% through caching improvements")];
      const result = verifyGrounding(
        "You mentioned that you reduced latency by 40% through caching.",
        facts
      );
      // Number matching + word overlap should help ground this
      expect(result.score).toBeGreaterThan(0);
    });

    it("score is between 0 and 1", () => {
      const facts = [makeFact("I worked at Google")];
      const result = verifyGrounding(
        "You mentioned that you worked at Google. You also said you built a rocket ship.",
        facts
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});

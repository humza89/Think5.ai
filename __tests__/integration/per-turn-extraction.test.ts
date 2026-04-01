/**
 * N6: Per-Turn Semantic Extraction Integration Tests
 *
 * Validates that extractFactsImmediate extracts facts from candidate turns
 * before the next turn is generated.
 */

import { describe, it, expect } from "vitest";
import { extractFactsImmediate } from "@/lib/fact-extractor";

describe("N6: Per-Turn Semantic Extraction", () => {
  it("extracts experience facts from candidate turns", () => {
    const facts = extractFactsImmediate({
      turnId: "test-turn-1",
      role: "candidate",
      content: "I spent 3 years at Stripe working on payment infrastructure.",
    });

    expect(facts.length).toBeGreaterThan(0);
    // Should extract company/experience facts
    const contentLower = facts.map(f => f.content.toLowerCase()).join(" ");
    expect(contentLower).toContain("stripe");
  });

  it("does not extract from interviewer turns", () => {
    const facts = extractFactsImmediate({
      turnId: "test-turn-2",
      role: "interviewer",
      content: "Can you tell me about your experience at Stripe?",
    });

    expect(facts).toHaveLength(0);
  });

  it("handles empty content gracefully", () => {
    const facts = extractFactsImmediate({
      turnId: "test-turn-3",
      role: "candidate",
      content: "",
    });

    expect(facts).toHaveLength(0);
  });

  it("each fact has required fields", () => {
    const facts = extractFactsImmediate({
      turnId: "test-turn-4",
      role: "candidate",
      content: "I have 5 years of experience in machine learning and Python. I led a team of 8 engineers at Google.",
    });

    for (const fact of facts) {
      expect(fact.turnId).toBe("test-turn-4");
      expect(typeof fact.factType).toBe("string");
      expect(typeof fact.content).toBe("string");
      expect(typeof fact.confidence).toBe("number");
      expect(fact.confidence).toBeGreaterThan(0);
      expect(fact.confidence).toBeLessThanOrEqual(1);
    }
  });
});

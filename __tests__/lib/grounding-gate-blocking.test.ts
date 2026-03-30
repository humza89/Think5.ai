import { describe, it, expect } from "vitest";
import { verifyGrounding } from "@/lib/grounding-gate";
import type { ExtractedFact } from "@/lib/fact-extractor";

const makeFact = (content: string): ExtractedFact => ({
  turnId: "turn-1",
  factType: "CLAIM",
  content,
  confidence: 0.9,
  extractedBy: "immediate",
});

describe("Grounding Gate — Blocking Threshold", () => {
  it("returns score < 0.5 when majority of claims are unsupported", () => {
    // AI references many things, only 1 is partially supported
    const facts = [makeFact("worked at Google for 5 years")];
    const result = verifyGrounding(
      "You mentioned that you built a quantum computer at NASA. You also said you managed 200 people at SpaceX. Earlier you noted your 15 years at Amazon building rockets.",
      facts
    );
    // Score should be low — all claims unsupported (no Google reference in AI text)
    expect(result.score).toBeLessThan(0.5);
    expect(result.grounded).toBe(false);
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it("returns score >= 0.5 when majority of claims are supported", () => {
    const facts = [
      makeFact("worked at Google for 5 years"),
      makeFact("led a team of 12 engineers"),
      makeFact("built a caching layer that reduced latency by 40%"),
    ];
    const result = verifyGrounding(
      "You mentioned that you worked at Google and led a team of 12 engineers.",
      facts
    );
    expect(result.score).toBeGreaterThanOrEqual(0.5);
  });

  it("returns grounded=true and score=1.0 when no assertions found", () => {
    const result = verifyGrounding(
      "What technologies have you worked with recently?",
      [makeFact("worked at Google")]
    );
    expect(result.grounded).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.totalClaims).toBe(0);
  });

  it("correctly identifies which claims are unsupported", () => {
    const facts = [makeFact("I worked at Stripe for 3 years on payments infrastructure")];
    const result = verifyGrounding(
      "You mentioned that you worked at Stripe and that you also interned at Meta during college.",
      facts
    );
    // "interned at Meta" should be unsupported
    const hasMetaClaim = result.unsupportedClaims.some(
      (c) => c.toLowerCase().includes("meta") || c.toLowerCase().includes("intern")
    );
    expect(hasMetaClaim).toBe(true);
  });

  it("content stripping logic: sentences with unsupported claims should be removable", () => {
    const facts = [makeFact("worked at Google")];
    const result = verifyGrounding(
      "You mentioned that you built a spaceship at NASA. That's quite impressive. You also mentioned working at Google.",
      facts
    );
    // The unsupported claims can be used to strip content
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);

    // Simulate the stripping logic from voice/route.ts
    const content = "You mentioned that you built a spaceship at NASA. That's quite impressive. You also mentioned working at Google.";
    const sentences = content.split(/(?<=[.!?])\s+/);
    const cleaned = sentences.filter((s: string) =>
      !result.unsupportedClaims.some((claim: string) =>
        s.toLowerCase().includes(claim.toLowerCase().slice(0, 50))
      )
    );
    const groundedContent = cleaned.join(" ").trim() || "Let's continue with the interview.";

    // The grounded content should not contain NASA reference
    expect(groundedContent.toLowerCase()).not.toContain("nasa");
    // But should still mention Google (supported)
    expect(groundedContent.toLowerCase()).toContain("google");
  });
});

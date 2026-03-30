import { describe, it, expect } from "vitest";
import {
  detectContradictions,
  findAllContradictions,
  extractTemporalInfo,
  extractScopeInfo,
} from "@/lib/semantic-contradiction-detector";
import type { ExtractedFact } from "@/lib/fact-extractor";

describe("Semantic Contradiction Detector", () => {
  describe("Temporal extraction", () => {
    it("extracts date range", () => {
      const result = extractTemporalInfo("I worked there from 2019 to 2022");
      expect(result).toEqual({ startYear: 2019, endYear: 2022, duration: 3 });
    });

    it("extracts 'since' year", () => {
      const result = extractTemporalInfo("I've been there since 2020");
      expect(result).toEqual({ startYear: 2020 });
    });

    it("extracts 'left in' year", () => {
      const result = extractTemporalInfo("I left in 2021");
      expect(result).toEqual({ endYear: 2021 });
    });

    it("extracts duration in years", () => {
      const result = extractTemporalInfo("I have 5 years of experience");
      expect(result).toEqual({ duration: 5 });
    });

    it("returns null for no temporal info", () => {
      expect(extractTemporalInfo("I like programming")).toBeNull();
    });
  });

  describe("Scope extraction", () => {
    it("detects solo work", () => {
      expect(extractScopeInfo("I built it solo")).toEqual({ scale: "solo", count: 1 });
      expect(extractScopeInfo("I did it by myself")).toEqual({ scale: "solo", count: 1 });
    });

    it("detects small team", () => {
      expect(extractScopeInfo("team of 5 engineers")).toEqual({ scale: "small_team", count: 5 });
    });

    it("detects large team", () => {
      expect(extractScopeInfo("team of 50 engineers")).toEqual({ scale: "large_team", count: 50 });
    });

    it("detects organization scope", () => {
      expect(extractScopeInfo("entire organization")).toEqual({ scale: "organization" });
    });

    it("returns unknown for ambiguous text", () => {
      expect(extractScopeInfo("I worked on the project")).toEqual({ scale: "unknown" });
    });
  });

  describe("Numeric contradictions", () => {
    it("detects significant number mismatch for same entity", () => {
      const existing: ExtractedFact = {
        turnId: "t1", factType: "METRIC", content: "led team of 5 engineers at Google",
        confidence: 0.9, extractedBy: "regex",
      };
      const newFact: ExtractedFact = {
        turnId: "t5", factType: "METRIC", content: "managed team of 50 engineers at Google",
        confidence: 0.85, extractedBy: "regex",
      };

      const contradictions = detectContradictions(newFact, [existing]);
      expect(contradictions.some((c) => c.type === "numeric")).toBe(true);
    });

    it("does not flag similar numbers for same entity", () => {
      const existing: ExtractedFact = {
        turnId: "t1", factType: "METRIC", content: "5 engineers at Google",
        confidence: 0.9, extractedBy: "regex",
      };
      const newFact: ExtractedFact = {
        turnId: "t5", factType: "METRIC", content: "6 engineers at Google",
        confidence: 0.85, extractedBy: "regex",
      };

      const contradictions = detectContradictions(newFact, [existing]);
      const numericContradictions = contradictions.filter((c) => c.type === "numeric");
      expect(numericContradictions).toHaveLength(0);
    });
  });

  describe("Entity-scope contradictions", () => {
    it("detects solo vs team mismatch", () => {
      const existing: ExtractedFact = {
        turnId: "t1", factType: "RESPONSIBILITY", content: "I built the system solo at Google",
        confidence: 0.9, extractedBy: "regex",
      };
      const newFact: ExtractedFact = {
        turnId: "t5", factType: "RESPONSIBILITY", content: "my team of 10 built the system at Google",
        confidence: 0.85, extractedBy: "regex",
      };

      const contradictions = detectContradictions(newFact, [existing]);
      expect(contradictions.some((c) => c.type === "entity_scope")).toBe(true);
    });
  });

  describe("Batch contradiction finding", () => {
    it("finds all contradictions in a fact set", () => {
      const facts: ExtractedFact[] = [
        { turnId: "t1", factType: "METRIC", content: "5 years at Google", confidence: 0.9, extractedBy: "regex" },
        { turnId: "t3", factType: "METRIC", content: "2 years at Google", confidence: 0.8, extractedBy: "regex" },
        { turnId: "t5", factType: "RESPONSIBILITY", content: "solo project at Google", confidence: 0.85, extractedBy: "regex" },
        { turnId: "t7", factType: "RESPONSIBILITY", content: "team of 20 at Google", confidence: 0.8, extractedBy: "regex" },
      ];

      const contradictions = findAllContradictions(facts);
      expect(contradictions.length).toBeGreaterThan(0);
    });

    it("returns empty for consistent facts", () => {
      const facts: ExtractedFact[] = [
        { turnId: "t1", factType: "TECHNICAL_SKILL", content: "React", confidence: 0.9, extractedBy: "regex" },
        { turnId: "t3", factType: "TECHNICAL_SKILL", content: "TypeScript", confidence: 0.9, extractedBy: "regex" },
        { turnId: "t5", factType: "COMPANY", content: "worked at Stripe", confidence: 0.85, extractedBy: "regex" },
      ];

      const contradictions = findAllContradictions(facts);
      expect(contradictions).toHaveLength(0);
    });
  });

  describe("Same-turn exclusion", () => {
    it("does not flag facts from the same turn as contradictions", () => {
      const existing: ExtractedFact = {
        turnId: "t1", factType: "METRIC", content: "5 engineers at Google",
        confidence: 0.9, extractedBy: "regex",
      };
      const newFact: ExtractedFact = {
        turnId: "t1", factType: "METRIC", content: "50 engineers at Google",
        confidence: 0.85, extractedBy: "regex",
      };

      const contradictions = detectContradictions(newFact, [existing]);
      expect(contradictions).toHaveLength(0);
    });
  });
});

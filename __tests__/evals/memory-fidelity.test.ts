import { describe, it, expect } from "vitest";
import { scoreMemoryFidelity } from "@/lib/memory-fidelity-scorer";
import type { GroundTruthFact } from "@/lib/memory-fidelity-scorer";

describe("Memory Fidelity Evaluation Suite", () => {
  const groundTruthFacts: GroundTruthFact[] = [
    { content: "5 years at Google on search infrastructure", factType: "COMPANY", turnIndex: 2 },
    { content: "led team of 8 engineers", factType: "METRIC", turnIndex: 4 },
    { content: "improved latency by 40%", factType: "METRIC", turnIndex: 6 },
    { content: "bachelor's degree in computer science from MIT", factType: "CLAIM", turnIndex: 8 },
    { content: "experience with Kubernetes and Docker", factType: "TECHNICAL_SKILL", turnIndex: 10 },
    { content: "managed $2M annual infrastructure budget", factType: "METRIC", turnIndex: 12 },
  ];

  describe("Perfect recall scenario", () => {
    it("scores 1.0 recall when all facts are present", () => {
      const retrievedFacts = groundTruthFacts.map((gt) => ({
        factType: gt.factType,
        content: gt.content,
        confidence: 0.9,
      }));

      const score = scoreMemoryFidelity(
        retrievedFacts,
        groundTruthFacts,
        20,
        new Set([2, 4, 6, 8, 10, 12])
      );

      expect(score.recall).toBe(1.0);
      expect(score.missingFacts).toHaveLength(0);
    });
  });

  describe("Partial recall scenario", () => {
    it("scores correctly when some facts are missing", () => {
      const retrievedFacts = [
        { factType: "COMPANY", content: "5 years at Google on search infrastructure", confidence: 0.9 },
        { factType: "METRIC", content: "led team of 8 engineers", confidence: 0.85 },
        { factType: "TECHNICAL_SKILL", content: "experience with Kubernetes and Docker", confidence: 0.9 },
      ];

      const score = scoreMemoryFidelity(
        retrievedFacts,
        groundTruthFacts,
        20,
        new Set([2, 4, 10])
      );

      expect(score.recall).toBeCloseTo(0.5, 1); // 3/6
      expect(score.missingFacts).toHaveLength(3);
    });
  });

  describe("Precision with phantom facts", () => {
    it("detects phantom facts not in ground truth", () => {
      const retrievedFacts = [
        { factType: "COMPANY", content: "5 years at Google on search infrastructure", confidence: 0.9 },
        { factType: "COMPANY", content: "3 years at Facebook on ads platform", confidence: 0.8 }, // phantom
        { factType: "METRIC", content: "led team of 200 engineers", confidence: 0.7 }, // phantom (wrong number)
      ];

      const score = scoreMemoryFidelity(
        retrievedFacts,
        groundTruthFacts,
        20,
        new Set([2])
      );

      expect(score.precision).toBeLessThan(1.0);
      expect(score.phantomFacts.length).toBeGreaterThan(0);
    });
  });

  describe("Coverage measurement", () => {
    it("full coverage when all turns have facts", () => {
      const score = scoreMemoryFidelity(
        groundTruthFacts.map((gt) => ({
          factType: gt.factType,
          content: gt.content,
          confidence: 0.9,
        })),
        groundTruthFacts,
        6, // Only 6 turns, all covered
        new Set([0, 1, 2, 3, 4, 5])
      );

      expect(score.coverage).toBe(1.0);
    });

    it("partial coverage when some turns lack facts", () => {
      const score = scoreMemoryFidelity(
        [{ factType: "COMPANY", content: "5 years at Google", confidence: 0.9 }],
        [{ content: "5 years at Google", factType: "COMPANY" }],
        20,
        new Set([2, 4]) // Only 2 of 20 turns covered
      );

      expect(score.coverage).toBe(0.1); // 2/20
      expect(score.turnCoverage.covered).toBe(2);
      expect(score.turnCoverage.total).toBe(20);
    });
  });

  describe("Fuzzy matching handles paraphrasing", () => {
    it("matches paraphrased facts via word overlap", () => {
      const retrievedFacts = [
        { factType: "COMPANY", content: "worked at Google for 5 years doing search infra", confidence: 0.9 },
      ];
      const groundTruth = [
        { content: "5 years at Google on search infrastructure", factType: "COMPANY" },
      ];

      const score = scoreMemoryFidelity(retrievedFacts, groundTruth, 10, new Set([2]));
      expect(score.recall).toBe(1.0);
    });
  });

  describe("Empty edge cases", () => {
    it("no ground truth = perfect recall", () => {
      const score = scoreMemoryFidelity([], [], 0, new Set());
      expect(score.recall).toBe(1.0);
      expect(score.precision).toBe(1.0);
      expect(score.coverage).toBe(1.0);
    });

    it("ground truth but no retrieved facts = zero recall", () => {
      const score = scoreMemoryFidelity(
        [],
        groundTruthFacts,
        20,
        new Set()
      );
      expect(score.recall).toBe(0);
      expect(score.missingFacts).toHaveLength(6);
    });
  });

  describe("Threshold validation", () => {
    it("good interview meets minimum thresholds: recall >= 0.7, precision >= 0.8", () => {
      const retrievedFacts = groundTruthFacts.slice(0, 5).map((gt) => ({
        factType: gt.factType,
        content: gt.content,
        confidence: 0.9,
      }));

      const score = scoreMemoryFidelity(
        retrievedFacts,
        groundTruthFacts,
        20,
        new Set([2, 4, 6, 8, 10])
      );

      expect(score.recall).toBeGreaterThanOrEqual(0.7);
      expect(score.precision).toBeGreaterThanOrEqual(0.8);
    });
  });
});

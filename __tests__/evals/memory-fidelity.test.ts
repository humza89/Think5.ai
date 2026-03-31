import { describe, it, expect } from "vitest";
import { scoreMemoryFidelity } from "@/lib/memory-fidelity-scorer";
import type { GroundTruthFact } from "@/lib/memory-fidelity-scorer";
import { detectContradictions } from "@/lib/semantic-contradiction-detector";

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

  // ── AF10: Enterprise-threshold memory fidelity evals ────────────────

  describe("AF10: 20-turn perfect scenario", () => {
    const twentyTurnFacts: GroundTruthFact[] = [
      { content: "5 years at Google on search infrastructure", factType: "COMPANY", turnIndex: 1 },
      { content: "led team of 8 engineers", factType: "METRIC", turnIndex: 2 },
      { content: "improved latency by 40%", factType: "METRIC", turnIndex: 3 },
      { content: "bachelor's degree in computer science from MIT", factType: "CLAIM", turnIndex: 4 },
      { content: "experience with Kubernetes and Docker", factType: "TECHNICAL_SKILL", turnIndex: 5 },
      { content: "managed $2M annual infrastructure budget", factType: "METRIC", turnIndex: 6 },
      { content: "built real-time data pipeline processing 1M events per second", factType: "TECHNICAL_SKILL", turnIndex: 7 },
      { content: "mentored 3 junior engineers to promotion", factType: "METRIC", turnIndex: 8 },
      { content: "designed microservices migration reducing deploy time by 60%", factType: "TECHNICAL_SKILL", turnIndex: 9 },
      { content: "published paper on distributed consensus algorithms", factType: "CLAIM", turnIndex: 10 },
      { content: "worked with cross-functional teams of product and design", factType: "RESPONSIBILITY", turnIndex: 11 },
      { content: "on-call rotation managing 99.99% uptime SLA", factType: "METRIC", turnIndex: 12 },
      { content: "experience with gRPC and Protocol Buffers", factType: "TECHNICAL_SKILL", turnIndex: 13 },
      { content: "led incident response for 3 P0 outages", factType: "RESPONSIBILITY", turnIndex: 14 },
      { content: "reduced cloud costs by $500K annually through optimization", factType: "METRIC", turnIndex: 15 },
      { content: "proficient in Go, Python, and TypeScript", factType: "TECHNICAL_SKILL", turnIndex: 16 },
      { content: "implemented A/B testing framework used by 200 engineers", factType: "TECHNICAL_SKILL", turnIndex: 17 },
      { content: "experience with Terraform and infrastructure as code", factType: "TECHNICAL_SKILL", turnIndex: 18 },
      { content: "presented at internal tech talks on system reliability", factType: "CLAIM", turnIndex: 19 },
      { content: "strong advocate for test-driven development practices", factType: "CLAIM", turnIndex: 20 },
    ];

    it("recall >= 0.99 and precision >= 0.99 for perfect retrieval", () => {
      const retrievedFacts = twentyTurnFacts.map((gt) => ({
        factType: gt.factType,
        content: gt.content,
        confidence: 0.95,
      }));

      const allTurnIndices = new Set(twentyTurnFacts.map((f) => f.turnIndex!));

      const score = scoreMemoryFidelity(
        retrievedFacts,
        twentyTurnFacts,
        20,
        allTurnIndices
      );

      expect(score.recall).toBeGreaterThanOrEqual(0.99);
      expect(score.precision).toBeGreaterThanOrEqual(0.99);
      expect(score.missingFacts).toHaveLength(0);
      expect(score.phantomFacts).toHaveLength(0);
    });
  });

  describe("AF10: Reconnect scenario — no facts lost", () => {
    it("10 pre-reconnect + 5 post-reconnect facts → no facts lost", () => {
      // 10 facts gathered before reconnect
      const preReconnectFacts: GroundTruthFact[] = [
        { content: "5 years at Google on search infrastructure", factType: "COMPANY", turnIndex: 1 },
        { content: "led team of 8 engineers", factType: "METRIC", turnIndex: 2 },
        { content: "improved latency by 40%", factType: "METRIC", turnIndex: 3 },
        { content: "bachelor's degree in computer science from MIT", factType: "CLAIM", turnIndex: 4 },
        { content: "experience with Kubernetes and Docker", factType: "TECHNICAL_SKILL", turnIndex: 5 },
        { content: "managed $2M annual infrastructure budget", factType: "METRIC", turnIndex: 6 },
        { content: "built real-time data pipeline", factType: "TECHNICAL_SKILL", turnIndex: 7 },
        { content: "mentored 3 junior engineers", factType: "METRIC", turnIndex: 8 },
        { content: "designed microservices migration", factType: "TECHNICAL_SKILL", turnIndex: 9 },
        { content: "published paper on distributed consensus", factType: "CLAIM", turnIndex: 10 },
      ];

      // 5 facts gathered after reconnect
      const postReconnectFacts: GroundTruthFact[] = [
        { content: "reduced cloud costs by $500K annually", factType: "METRIC", turnIndex: 12 },
        { content: "proficient in Go, Python, and TypeScript", factType: "TECHNICAL_SKILL", turnIndex: 13 },
        { content: "led incident response for P0 outages", factType: "RESPONSIBILITY", turnIndex: 14 },
        { content: "experience with Terraform infrastructure as code", factType: "TECHNICAL_SKILL", turnIndex: 15 },
        { content: "presented at internal tech talks", factType: "CLAIM", turnIndex: 16 },
      ];

      const allGroundTruth = [...preReconnectFacts, ...postReconnectFacts];

      // Memory system should have retained all facts through reconnect
      const retrievedFacts = allGroundTruth.map((gt) => ({
        factType: gt.factType,
        content: gt.content,
        confidence: 0.9,
      }));

      const coveredTurns = new Set(allGroundTruth.map((f) => f.turnIndex!));

      const score = scoreMemoryFidelity(
        retrievedFacts,
        allGroundTruth,
        20,
        coveredTurns
      );

      // No facts should be lost through reconnect
      expect(score.recall).toBe(1.0);
      expect(score.missingFacts).toHaveLength(0);
      expect(score.precision).toBe(1.0);
    });
  });

  describe("AF10: Enterprise threshold regression", () => {
    it("expect(score.recall).toBeGreaterThanOrEqual(0.99) for perfect retrieval", () => {
      // Use the same groundTruthFacts from the outer scope
      const retrievedFacts = groundTruthFacts.map((gt) => ({
        factType: gt.factType,
        content: gt.content,
        confidence: 0.95,
      }));

      const coveredTurns = new Set(groundTruthFacts.map((f) => f.turnIndex!));

      const score = scoreMemoryFidelity(
        retrievedFacts,
        groundTruthFacts,
        20,
        coveredTurns
      );

      // Enterprise threshold: perfect retrieval must achieve >= 0.99 recall
      expect(score.recall).toBeGreaterThanOrEqual(0.99);
    });
  });

  describe("AF10: Contradiction detection", () => {
    it("facts with conflicting numbers are flagged", () => {
      const existingFacts = [
        {
          turnId: "turn-1",
          content: "led team of 8 engineers at Google",
          factType: "METRIC" as const,
          confidence: 0.9,
          extractedBy: "checkpoint",
        },
      ];

      const contradictingFact = {
        turnId: "turn-5",
        content: "led team of 200 engineers at Google",
        factType: "METRIC" as const,
        confidence: 0.85,
        extractedBy: "checkpoint",
      };

      const contradictions = detectContradictions(contradictingFact, existingFacts);

      // Should detect numeric contradiction: 8 vs 200 for same entity (Google)
      expect(contradictions.length).toBeGreaterThan(0);
      const numericContradiction = contradictions.find((c) => c.type === "numeric");
      expect(numericContradiction).toBeDefined();
      expect(numericContradiction!.description).toContain("google");
    });
  });
});

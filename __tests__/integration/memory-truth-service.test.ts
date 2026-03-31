import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock data buckets (mutated per test) ────────────────────────────
let mockTranscriptRows: any[] = [];
let mockFactRows: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewTranscript: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockTranscriptRows)),
    },
    interviewFact: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockFactRows)),
    },
  },
}));

vi.mock("@/lib/session-store", () => ({
  getSessionState: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/interviewer-state", () => ({
  deserializeState: vi.fn().mockReturnValue({
    contradictionMap: [],
    commitments: [],
  }),
  createInitialState: vi.fn(),
}));

// ── Dynamic imports (after mocks are wired) ─────────────────────────
const { buildMemoryTruth, computeFactRecall, computeFactPrecision } =
  await import("@/lib/memory-truth-service");

// ── Helpers ─────────────────────────────────────────────────────────

function makeTurn(
  index: number,
  role: "interviewer" | "candidate",
  content: string
) {
  return {
    turnId: `turn-${index}`,
    turnIndex: index,
    role,
    content,
    causalParentTurnId: null,
    timestamp: new Date("2026-01-01T00:00:00Z"),
  };
}

function makeFact(
  index: number,
  turnId: string,
  opts: { factType?: string; content?: string; confidence?: number } = {}
) {
  return {
    id: `fact-${index}`,
    factType: opts.factType ?? "TECHNICAL_SKILL",
    content: opts.content ?? `Fact content number ${index}`,
    confidence: opts.confidence ?? 0.85,
    turnId,
    extractedBy: "checkpoint",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("REM-6: Memory Truth Service integration", () => {
  beforeEach(() => {
    mockTranscriptRows = [];
    mockFactRows = [];
  });

  // ── 1. 20 turns + 10 facts → correct integrity metrics ───────────
  it("20 turns + 10 facts → correct integrity metrics", async () => {
    // 20 turns alternating interviewer / candidate
    for (let i = 0; i < 20; i++) {
      const role = i % 2 === 0 ? "interviewer" : "candidate";
      mockTranscriptRows.push(
        makeTurn(i, role, `Turn ${i} content from ${role}`)
      );
    }

    // 10 facts, each pointing to a candidate turn (odd indices)
    for (let i = 0; i < 10; i++) {
      const turnId = `turn-${i * 2 + 1}`; // candidate turns
      mockFactRows.push(makeFact(i, turnId));
    }

    const truth = await buildMemoryTruth("test-interview-1");

    expect(truth.integrity.totalTurns).toBe(20);
    expect(truth.integrity.totalFacts).toBe(10);
    expect(truth.integrity.factDensity).toBe(0.5);
  });

  // ── 2. All facts have valid turnId references ────────────────────
  it("all canonical facts reference a valid turn in the turn graph", async () => {
    for (let i = 0; i < 20; i++) {
      const role = i % 2 === 0 ? "interviewer" : "candidate";
      mockTranscriptRows.push(
        makeTurn(i, role, `Turn ${i} content from ${role}`)
      );
    }
    for (let i = 0; i < 10; i++) {
      mockFactRows.push(makeFact(i, `turn-${i * 2 + 1}`));
    }

    const truth = await buildMemoryTruth("test-interview-2");
    const turnIds = new Set(truth.turnGraph.map((t) => t.turnId));

    for (const fact of truth.canonicalFacts) {
      expect(turnIds.has(fact.turnId)).toBe(true);
    }
  });

  // ── 3. Unresolved questions detected correctly ───────────────────
  describe("unresolved question detection", () => {
    it("detects interviewer question without a following candidate response", async () => {
      // 15 normal alternating turns, then turn 15 is an unanswered question
      for (let i = 0; i < 15; i++) {
        const role = i % 2 === 0 ? "interviewer" : "candidate";
        mockTranscriptRows.push(
          makeTurn(i, role, `Turn ${i} content from ${role}`)
        );
      }
      // Turn 15: interviewer asks a question with no following candidate turn
      mockTranscriptRows.push(
        makeTurn(15, "interviewer", "Can you describe your system design experience?")
      );

      const truth = await buildMemoryTruth("test-interview-3a");
      expect(truth.unresolvedQuestions.length).toBeGreaterThanOrEqual(1);

      const last = truth.unresolvedQuestions.find(
        (q) => q.turnId === "turn-15"
      );
      expect(last).toBeDefined();
      expect(last!.answered).toBe(false);
    });

    it("does NOT flag a question that has a subsequent candidate response", async () => {
      // Interviewer question followed by candidate answer
      mockTranscriptRows.push(
        makeTurn(0, "interviewer", "What is your strongest language?")
      );
      mockTranscriptRows.push(
        makeTurn(1, "candidate", "I am most proficient in TypeScript.")
      );

      const truth = await buildMemoryTruth("test-interview-3b");
      const q = truth.unresolvedQuestions.find((q) => q.turnId === "turn-0");
      expect(q).toBeUndefined();
    });
  });

  // ── 4. Fact deduplication — highest confidence wins ──────────────
  it("deduplicates facts by content, keeping highest confidence", async () => {
    mockTranscriptRows.push(
      makeTurn(0, "interviewer", "Tell me about your skills."),
      makeTurn(1, "candidate", "I know React and TypeScript very well.")
    );

    // Two facts with identical factType + content but different confidence
    mockFactRows.push(
      makeFact(0, "turn-1", {
        factType: "TECHNICAL_SKILL",
        content: "React",
        confidence: 0.7,
      }),
      makeFact(1, "turn-1", {
        factType: "TECHNICAL_SKILL",
        content: "React",
        confidence: 0.9,
      })
    );

    const truth = await buildMemoryTruth("test-interview-4");
    const reactFacts = truth.canonicalFacts.filter(
      (f) => f.content === "React" && f.factType === "TECHNICAL_SKILL"
    );

    expect(reactFacts).toHaveLength(1);
    expect(reactFacts[0].confidence).toBe(0.9);
  });

  // ── 5. computeFactRecall — 100 % recall ──────────────────────────
  it("computeFactRecall returns 1.0 recall when all ground truth facts are present", async () => {
    for (let i = 0; i < 20; i++) {
      const role = i % 2 === 0 ? "interviewer" : "candidate";
      mockTranscriptRows.push(
        makeTurn(i, role, `Turn ${i} content from ${role}`)
      );
    }
    for (let i = 0; i < 10; i++) {
      mockFactRows.push(makeFact(i, `turn-${i * 2 + 1}`));
    }

    const truth = await buildMemoryTruth("test-interview-5");

    // Ground truth matches every canonical fact
    const groundTruth = truth.canonicalFacts.map((f) => ({
      content: f.content,
      factType: f.factType,
    }));

    const result = computeFactRecall(truth, groundTruth);
    expect(result.recall).toBe(1.0);
    expect(result.missing).toHaveLength(0);
  });

  // ── 6. computeFactRecall — partial recall ────────────────────────
  it("computeFactRecall returns 0.5 recall when half the ground truth is missing", async () => {
    for (let i = 0; i < 10; i++) {
      const role = i % 2 === 0 ? "interviewer" : "candidate";
      mockTranscriptRows.push(
        makeTurn(i, role, `Turn ${i} content from ${role}`)
      );
    }
    // Only 5 facts present in memory truth
    for (let i = 0; i < 5; i++) {
      mockFactRows.push(makeFact(i, `turn-${i * 2 + 1}`));
    }

    const truth = await buildMemoryTruth("test-interview-6");

    // Ground truth has 10 facts — 5 present, 5 absent
    const groundTruth = [
      ...truth.canonicalFacts.map((f) => ({
        content: f.content,
        factType: f.factType,
      })),
      // 5 additional facts that do NOT exist in memory truth
      { content: "Missing fact alpha", factType: "EXPERIENCE" },
      { content: "Missing fact beta", factType: "EXPERIENCE" },
      { content: "Missing fact gamma", factType: "EDUCATION" },
      { content: "Missing fact delta", factType: "EDUCATION" },
      { content: "Missing fact epsilon", factType: "COMPANY" },
    ];

    const result = computeFactRecall(truth, groundTruth);
    expect(result.recall).toBe(0.5);
    expect(result.missing).toHaveLength(5);
  });
});

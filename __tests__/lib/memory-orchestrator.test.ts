import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionState } from "@/lib/session-store";
import { createInitialState, serializeState } from "@/lib/interviewer-state";

/**
 * Memory Orchestrator Tests — validate unified memory packet composition.
 *
 * Mocks Prisma and conversation-ledger to test orchestration logic
 * without database dependencies.
 */

// Mock feature flags — disable fail-closed so Prisma mock errors degrade gracefully
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (flag: string) => flag !== "FAIL_CLOSED_PRODUCTION",
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewFact: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interview: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    interviewEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interviewTranscript: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock conversation ledger
vi.mock("@/lib/conversation-ledger", () => ({
  getLedgerWindow: vi.fn().mockResolvedValue([]),
}));

import { prisma } from "@/lib/prisma";
import { getLedgerWindow } from "@/lib/conversation-ledger";
import { composeMemoryPacket } from "@/lib/memory-orchestrator";

function makeSession(overrides?: Partial<SessionState>): SessionState {
  return {
    interviewId: "test-interview",
    candidateName: "Jane Doe",
    reconnectToken: "token-123",
    lastTurnIndex: 10,
    questionCount: 5,
    currentModule: "technical",
    currentDifficultyLevel: "mid",
    moduleScores: [{ module: "intro", score: 8, reason: "Strong communication" }],
    candidateProfile: {
      strengths: ["system design"],
      weaknesses: [],
    },
    interviewerState: serializeState(createInitialState()),
    ...overrides,
  } as SessionState;
}

describe("Memory Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes packet with all default fields", async () => {
    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.currentStep).toBe("opening");
    expect(packet.introDone).toBe(false);
    expect(packet.askedQuestionIds).toHaveLength(0);
    expect(packet.verifiedFacts).toHaveLength(0);
    expect(packet.knowledgeGraph).toBeNull();
    expect(packet.recentTurns).toHaveLength(0);
    expect(packet.moduleScores).toHaveLength(1);
    expect(packet.questionCount).toBe(5);
    expect(packet.currentDifficultyLevel).toBe("mid");
    expect(packet.currentModule).toBe("technical");
    expect(packet.stateHash).toBeTruthy();
  });

  it("populates recentTurns from ledger", async () => {
    const mockTurns = [
      { role: "interviewer", content: "Tell me about X.", turnIndex: 8, turnId: "t8" },
      { role: "candidate", content: "I built X at Google.", turnIndex: 9, turnId: "t9" },
      { role: "interviewer", content: "How did you scale it?", turnIndex: 10, turnId: "t10" },
    ];
    (getLedgerWindow as ReturnType<typeof vi.fn>).mockResolvedValue(mockTurns);

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.recentTurns).toHaveLength(3);
    expect(packet.recentTurns[0].role).toBe("interviewer");
    expect(packet.recentTurns[2].turnIndex).toBe(10);
  });

  it("populates verifiedFacts from Prisma", async () => {
    const mockFacts = [
      { factType: "METRIC", content: "reduced latency by 40%", confidence: 0.9 },
      { factType: "COMPANY", content: "Google", confidence: 0.95 },
    ];
    (prisma.interviewFact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockFacts);

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.verifiedFacts).toHaveLength(2);
    expect(packet.verifiedFacts[0].factType).toBe("METRIC");
  });

  it("populates knowledgeGraph from Prisma", async () => {
    const mockKG = {
      verified_claims: ["Built distributed systems at scale"],
      technical_stack: ["Go", "Kubernetes"],
    };
    (prisma.interview.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      knowledgeGraph: mockKG,
    });

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.knowledgeGraph).toEqual(mockKG);
  });

  it("gracefully degrades when Prisma fails for facts", async () => {
    (prisma.interviewFact.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB connection lost")
    );

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    // Should still return a valid packet with empty facts
    expect(packet.verifiedFacts).toHaveLength(0);
    expect(packet.currentStep).toBe("opening");
    expect(packet.stateHash).toBeTruthy();
  });

  it("gracefully degrades when Prisma fails for knowledge graph", async () => {
    (prisma.interview.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB timeout")
    );

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.knowledgeGraph).toBeNull();
  });

  it("gracefully degrades when ledger fails", async () => {
    (getLedgerWindow as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Ledger unavailable")
    );

    const session = makeSession();
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.recentTurns).toHaveLength(0);
  });

  it("falls back to initial state when interviewerState is invalid", async () => {
    const session = makeSession({ interviewerState: "invalid json" });
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.currentStep).toBe("opening");
    expect(packet.introDone).toBe(false);
  });

  it("falls back to initial state when interviewerState is null", async () => {
    const session = makeSession({ interviewerState: undefined });
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.currentStep).toBe("opening");
  });

  it("includes candidate profile from session", async () => {
    const session = makeSession({
      candidateProfile: {
        strengths: ["architecture", "communication"],
        weaknesses: ["time management"],
        communicationStyle: "concise",
      },
    });
    const packet = await composeMemoryPacket("test-interview", session);

    expect(packet.candidateProfile).toBeTruthy();
    expect(packet.candidateProfile!.strengths).toContain("architecture");
  });
});

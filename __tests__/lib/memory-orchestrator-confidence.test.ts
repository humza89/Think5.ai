import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Memory Orchestrator — Confidence Scoring Tests
 *
 * Verifies that memory confidence scores reflect retrieval success/failure
 * and that FAIL_CLOSED_PRODUCTION propagates errors.
 */

const featureFlags: Record<string, boolean> = {};

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (flag: string) => featureFlags[flag] ?? false,
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock Prisma
const mockFactFindMany = vi.fn();
const mockInterviewFindUnique = vi.fn();
const mockEventFindMany = vi.fn();
const mockTranscriptFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewFact: {
      findMany: (...args: unknown[]) => mockFactFindMany(...args),
    },
    interview: {
      findUnique: (...args: unknown[]) => mockInterviewFindUnique(...args),
    },
    interviewEvent: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
    },
    interviewTranscript: {
      findMany: (...args: unknown[]) => mockTranscriptFindMany(...args),
    },
  },
}));

// Mock conversation ledger
vi.mock("@/lib/conversation-ledger", () => ({
  getLedgerWindow: vi.fn().mockResolvedValue([
    { role: "candidate", content: "Hello", turnIndex: 0, turnId: "t-0" },
    { role: "assistant", content: "Hi there", turnIndex: 1, turnId: "t-1" },
  ]),
}));

// Mock interviewer state
vi.mock("@/lib/interviewer-state", () => ({
  deserializeState: vi.fn().mockReturnValue({
    currentStep: "questioning",
    introDone: true,
    currentTopic: "experience",
    askedQuestionIds: ["q-1"],
    followupQueue: [],
    contradictionMap: [],
    pendingClarifications: [],
    topicDepthCounters: {},
    commitments: [],
    revisitAllowList: [],
    stateHash: "abc123",
  }),
  createInitialState: vi.fn().mockReturnValue({
    currentStep: "intro",
    introDone: false,
    currentTopic: "",
    askedQuestionIds: [],
    followupQueue: [],
    contradictionMap: [],
    pendingClarifications: [],
    topicDepthCounters: {},
    commitments: [],
    revisitAllowList: [],
    stateHash: "",
  }),
}));

import { composeMemoryPacket } from "@/lib/memory-orchestrator";

describe("Memory Orchestrator — Confidence Scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(featureFlags).forEach((k) => delete featureFlags[k]);
    // Default: all succeed
    mockFactFindMany.mockResolvedValue([
      { factType: "COMPANY", content: "Google", confidence: 0.95 },
    ]);
    mockInterviewFindUnique.mockResolvedValue({ knowledgeGraph: { topics: ["AI"] } });
    mockEventFindMany.mockResolvedValue([]);
    mockTranscriptFindMany.mockResolvedValue([]);
  });

  it("returns confidence 1.0 when all sources succeed", async () => {
    const packet = await composeMemoryPacket("int-1", {
      interviewId: "int-1",
      interviewerState: "{}",
      lastTurnIndex: 1,
    } as any);

    // All 3 sources succeed (3/3 = 1.0) minus 0.1 context penalty (no turns in test) = 0.9
    expect(packet.memoryConfidence).toBeCloseTo(0.9);
    expect(packet.retrievalStatus.factsOk).toBe(true);
    expect(packet.retrievalStatus.knowledgeGraphOk).toBe(true);
    expect(packet.retrievalStatus.recentTurnsOk).toBe(true);
    expect(packet.retrievalStatus.errors).toHaveLength(0);
    // Manifest should be present
    expect(packet.manifest).toBeDefined();
    expect(packet.manifest.budgetTotal).toBeGreaterThan(0);
  });

  it("returns confidence ~0.67 when one source fails", async () => {
    // Facts fetch fails
    mockFactFindMany.mockRejectedValue(new Error("DB timeout"));

    const packet = await composeMemoryPacket("int-2", {
      interviewId: "int-2",
      interviewerState: "{}",
      lastTurnIndex: 1,
    } as any);

    // 2/3 sources succeed (0.667) minus 0.1 context penalty = 0.567
    expect(packet.memoryConfidence).toBeCloseTo(2 / 3 - 0.1);
    expect(packet.retrievalStatus.factsOk).toBe(false);
    expect(packet.retrievalStatus.knowledgeGraphOk).toBe(true);
    expect(packet.retrievalStatus.recentTurnsOk).toBe(true);
    expect(packet.retrievalStatus.errors.length).toBeGreaterThan(0);
    expect(packet.retrievalStatus.errors[0]).toContain("facts");
  });

  it("returns confidence 0.0 when all sources fail (non-fail-closed)", async () => {
    mockFactFindMany.mockRejectedValue(new Error("DB timeout"));
    mockInterviewFindUnique.mockRejectedValue(new Error("DB timeout"));

    // Also need conversation ledger to fail
    const { getLedgerWindow } = await import("@/lib/conversation-ledger");
    (getLedgerWindow as any).mockRejectedValueOnce(new Error("DB timeout"));

    const packet = await composeMemoryPacket("int-3", {
      interviewId: "int-3",
      interviewerState: "{}",
      lastTurnIndex: 1,
    } as any);

    expect(packet.memoryConfidence).toBe(0);
    expect(packet.retrievalStatus.factsOk).toBe(false);
    expect(packet.retrievalStatus.knowledgeGraphOk).toBe(false);
    expect(packet.retrievalStatus.recentTurnsOk).toBe(false);
    expect(packet.retrievalStatus.errors).toHaveLength(3);
  });

  it("throws when FAIL_CLOSED_PRODUCTION enabled and facts fail", async () => {
    featureFlags["FAIL_CLOSED_PRODUCTION"] = true;
    mockFactFindMany.mockRejectedValue(new Error("DB timeout"));

    await expect(
      composeMemoryPacket("int-4", {
        interviewId: "int-4",
        interviewerState: "{}",
        lastTurnIndex: 1,
      } as any)
    ).rejects.toThrow("Memory retrieval failed (facts)");
  });
});

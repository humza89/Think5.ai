import { describe, it, expect, vi, beforeEach } from "vitest";

let mockTranscriptRows: any[] = [];
let mockEventRows: any[] = [];
let mockFactRows: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewTranscript: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockTranscriptRows)),
    },
    interviewEvent: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockEventRows)),
    },
    interviewFact: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockFactRows)),
    },
  },
}));

const baseTime = new Date("2026-03-01T10:00:00Z").getTime();

function makeTranscriptRow(turnIndex: number, role: "candidate" | "interviewer" = "candidate") {
  return {
    turnId: `turn-${turnIndex}`,
    turnIndex,
    role,
    content: `Content for turn ${turnIndex}`,
    causalParentTurnId: null,
    timestamp: new Date(baseTime + turnIndex * 1000),
    serverReceivedAt: new Date(baseTime + turnIndex * 1000 + 100),
    contentChecksum: `checksum-${turnIndex}`,
    finalized: false,
  };
}

function makeEventRow(index: number, eventType: string, turnIndex: number) {
  return {
    id: `event-${index}`,
    eventType,
    payload: {},
    turnIndex,
    causalEventId: null,
    timestamp: new Date(baseTime + turnIndex * 1000 + 500),
  };
}

function makeFactRow(index: number, turnIndex: number) {
  return {
    id: `fact-${index}`,
    factType: "CLAIM",
    content: `Fact content ${index}`,
    confidence: 0.9,
    turnId: `turn-${turnIndex}`,
    extractedBy: "checkpoint",
    createdAt: new Date(baseTime + turnIndex * 1000 + 200),
  };
}

describe("Replay Diagnostics (REM-8)", () => {
  beforeEach(() => {
    mockTranscriptRows = [];
    mockEventRows = [];
    mockFactRows = [];
    vi.clearAllMocks();
  });

  it("clean session — 10 consecutive turns, no events, no facts", async () => {
    mockTranscriptRows = Array.from({ length: 10 }, (_, i) =>
      makeTranscriptRow(i, i % 2 === 0 ? "interviewer" : "candidate")
    );

    const { reconstructReplay } = await import("@/lib/replay-reconstructor");
    const report = await reconstructReplay("interview-clean");

    expect(report.continuityScore).toBe(1.0);
    expect(report.divergencePoints.length).toBe(0);
    expect(report.summary.turnCount).toBe(10);
    expect(report.summary.reconnectCount).toBe(0);
    expect(report.summary.gateViolationCount).toBe(0);
    expect(report.summary.contradictionCount).toBe(0);
    expect(report.frames.length).toBe(10);
  });

  it("reconnect mid-session — turns still consecutive, reconnect counted", async () => {
    mockTranscriptRows = Array.from({ length: 10 }, (_, i) =>
      makeTranscriptRow(i, i % 2 === 0 ? "interviewer" : "candidate")
    );
    mockEventRows = [makeEventRow(0, "reconnect", 5)];

    const { reconstructReplay } = await import("@/lib/replay-reconstructor");
    const report = await reconstructReplay("interview-reconnect");

    expect(report.summary.reconnectCount).toBe(1);
    expect(report.continuityScore).toBe(1.0);
    expect(report.summary.turnCount).toBe(10);
    expect(report.frames.length).toBe(11); // 10 turns + 1 event
  });

  it("gate violation blocked — output_gate_blocked event counted", async () => {
    mockTranscriptRows = Array.from({ length: 10 }, (_, i) =>
      makeTranscriptRow(i, i % 2 === 0 ? "interviewer" : "candidate")
    );
    mockEventRows = [makeEventRow(0, "output_gate_blocked", 3)];

    const { reconstructReplay } = await import("@/lib/replay-reconstructor");
    const report = await reconstructReplay("interview-gate");

    expect(report.summary.gateViolationCount).toBe(1);
    expect(report.continuityScore).toBe(1.0);
    expect(report.summary.turnCount).toBe(10);
  });

  it("contradiction detected — contradiction_detected event counted", async () => {
    mockTranscriptRows = Array.from({ length: 10 }, (_, i) =>
      makeTranscriptRow(i, i % 2 === 0 ? "interviewer" : "candidate")
    );
    mockEventRows = [makeEventRow(0, "contradiction_detected", 7)];

    const { reconstructReplay } = await import("@/lib/replay-reconstructor");
    const report = await reconstructReplay("interview-contradiction");

    expect(report.summary.contradictionCount).toBe(1);
    expect(report.continuityScore).toBe(1.0);
    expect(report.summary.turnCount).toBe(10);
  });

  it("memory gap — missing turnIndex 4 produces divergence and reduced continuity score", async () => {
    // Turns 0,1,2,3,5,6,7,8,9,10 — missing turnIndex 4
    const indices = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10];
    mockTranscriptRows = indices.map((i) =>
      makeTranscriptRow(i, i % 2 === 0 ? "interviewer" : "candidate")
    );

    const { reconstructReplay } = await import("@/lib/replay-reconstructor");
    const report = await reconstructReplay("interview-gap");

    expect(report.continuityScore).toBeLessThan(1.0);
    expect(report.divergencePoints.length).toBeGreaterThanOrEqual(1);

    const gapDivergence = report.divergencePoints.find(
      (d) => d.turnIndex === 5
    );
    expect(gapDivergence).toBeDefined();
    expect(gapDivergence!.description).toContain("gap");
    expect(gapDivergence!.severity).toBe("critical");
    expect(report.summary.turnCount).toBe(10);
  });
});

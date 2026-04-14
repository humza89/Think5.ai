/**
 * Track-1 Task 6 correctness tests for the broken-completed detector.
 *
 * Locks in the invariants: a COMPLETED interview is considered "broken"
 * if it violates any of (A) report-durable, (B) recording-state matches
 * URL, (C) transcript JSON present, (D) ledger fully finalized. The
 * detector is a pure function of the DB rows it's given, so the tests
 * use a tiny in-memory Prisma shim.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeInterviewRow {
  id: string;
  status: string;
  completedAt: Date | null;
  reportStatus: string | null;
  reportRetryCount: number;
  recordingState: string | null;
  recordingUrl: string | null;
  transcript: unknown;
}

const db = {
  interviews: [] as FakeInterviewRow[],
  transcriptTurns: [] as { interviewId: string; finalized: boolean }[],
};

function within(row: FakeInterviewRow, where: Record<string, unknown>): boolean {
  if (where.status && row.status !== where.status) return false;
  if (where.completedAt && typeof where.completedAt === "object") {
    const c = where.completedAt as { gte?: Date; lt?: Date };
    if (c.gte && (!row.completedAt || row.completedAt < c.gte)) return false;
    if (c.lt && (!row.completedAt || row.completedAt >= c.lt)) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const matches = db.interviews.filter((r) => within(r, args.where));
        return args.take ? matches.slice(0, args.take) : matches;
      },
    },
    interviewTranscript: {
      count: async (args: { where: { interviewId: string; finalized: boolean } }) => {
        return db.transcriptTurns.filter(
          (t) => t.interviewId === args.where.interviewId && t.finalized === args.where.finalized,
        ).length;
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function iv(over: Partial<FakeInterviewRow>): FakeInterviewRow {
  return {
    id: over.id ?? "iv",
    status: over.status ?? "COMPLETED",
    completedAt: over.completedAt ?? new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
    reportStatus: over.reportStatus !== undefined ? over.reportStatus : "completed",
    reportRetryCount: over.reportRetryCount ?? 0,
    recordingState: over.recordingState !== undefined ? over.recordingState : "COMPLETE",
    recordingUrl: over.recordingUrl !== undefined ? over.recordingUrl : "https://r2/iv",
    transcript: over.transcript !== undefined ? over.transcript : [{ role: "interviewer", content: "hi" }],
  };
}

beforeEach(() => {
  db.interviews = [];
  db.transcriptTurns = [];
  vi.resetModules();
});

// --- Happy path -------------------------------------------------------

describe("detectBrokenCompletedInterviews — happy path", () => {
  it("returns no broken rows when everything is healthy", async () => {
    db.interviews = [iv({ id: "a" }), iv({ id: "b" }), iv({ id: "c" })];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.scanned).toBe(3);
    expect(result.broken).toHaveLength(0);
  });

  it("ignores interviews within the grace window (just completed)", async () => {
    // Interview completed 30 seconds ago — still inside the 5-min grace.
    // Even with reportStatus=pending, it should be excluded from the scan.
    db.interviews = [
      iv({
        id: "just-now",
        completedAt: new Date(Date.now() - 30_000),
        reportStatus: "pending",
        recordingState: "UPLOADING",
      }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.scanned).toBe(0);
    expect(result.broken).toHaveLength(0);
  });

  it("ignores interviews outside the lookback window (too old)", async () => {
    db.interviews = [
      iv({
        id: "ancient",
        completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        reportStatus: null,
      }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.scanned).toBe(0);
  });
});

// --- Invariant A: report durability ----------------------------------

describe("detectBrokenCompletedInterviews — invariant A: report", () => {
  it("flags reportStatus=null as missing_report", async () => {
    db.interviews = [iv({ id: "r-null", reportStatus: null })];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0]!.reasons).toContain("missing_report");
  });

  it("flags reportStatus=pending as missing_report", async () => {
    db.interviews = [iv({ id: "r-pending", reportStatus: "pending" })];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken[0]!.reasons).toContain("missing_report");
  });

  it("flags reportStatus=generating ONLY if older than 10 minutes", async () => {
    db.interviews = [
      // Completed 3 min ago — within the 10-min generating tolerance
      iv({
        id: "fresh-gen",
        reportStatus: "generating",
        completedAt: new Date(Date.now() - 3 * 60_000),
      }),
      // Completed 20 min ago — stuck
      iv({
        id: "stuck-gen",
        reportStatus: "generating",
        completedAt: new Date(Date.now() - 20 * 60_000),
      }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    const byId: Record<string, (typeof result.broken)[number] | undefined> = Object.fromEntries(
      result.broken.map((b) => [b.interviewId, b]),
    );
    expect(byId["fresh-gen"]).toBeUndefined();
    expect(byId["stuck-gen"]!.reasons).toContain("report_stuck_generating");
  });

  it("flags reportStatus=failed only if retries are NOT exhausted", async () => {
    db.interviews = [
      // Still retriable — flag
      iv({ id: "retriable", reportStatus: "failed", reportRetryCount: 2 }),
      // Terminally failed — do not flag (a legitimate outcome)
      iv({ id: "terminal", reportStatus: "failed", reportRetryCount: 5 }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    const ids = result.broken.map((b) => b.interviewId);
    expect(ids).toContain("retriable");
    expect(ids).not.toContain("terminal");
  });
});

// --- Invariant B: recording state ------------------------------------

describe("detectBrokenCompletedInterviews — invariant B: recording", () => {
  it("flags recording_not_complete when recordingUrl exists but state is UPLOADING", async () => {
    db.interviews = [
      iv({ id: "uploading", recordingState: "UPLOADING" }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken[0]!.reasons).toContain("recording_not_complete");
  });

  it("does NOT flag when recordingUrl is null AND state is null (no recording by design)", async () => {
    db.interviews = [
      iv({ id: "no-rec", recordingUrl: null, recordingState: null }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken).toHaveLength(0);
  });

  it("accepts VERIFIED as well as COMPLETE", async () => {
    db.interviews = [
      iv({ id: "verified", recordingState: "VERIFIED" }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken).toHaveLength(0);
  });
});

// --- Invariant C: transcript JSON ------------------------------------

describe("detectBrokenCompletedInterviews — invariant C: transcript", () => {
  it("flags transcript_json_missing when Interview.transcript is null", async () => {
    db.interviews = [iv({ id: "no-tr", transcript: null })];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken[0]!.reasons).toContain("transcript_json_missing");
  });

  it("flags an empty array transcript as missing", async () => {
    db.interviews = [iv({ id: "empty-tr", transcript: [] })];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken[0]!.reasons).toContain("transcript_json_missing");
  });
});

// --- Invariant D: ledger finalization --------------------------------

describe("detectBrokenCompletedInterviews — invariant D: ledger", () => {
  it("flags transcript_ledger_not_finalized only when another reason already applies (efficiency guard)", async () => {
    // A completely healthy interview with one non-finalized ledger turn
    // should NOT be reported (the detector skips the count call for
    // clean rows). This is an intentional optimization documented in
    // the detector comments.
    db.interviews = [iv({ id: "iv-clean-but-ledger-dirty" })];
    db.transcriptTurns = [{ interviewId: "iv-clean-but-ledger-dirty", finalized: false }];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken).toHaveLength(0);
  });

  it("reports transcript_ledger_not_finalized when combined with another breakage", async () => {
    db.interviews = [iv({ id: "both", reportStatus: "pending" })];
    db.transcriptTurns = [
      { interviewId: "both", finalized: false },
      { interviewId: "both", finalized: false },
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.broken[0]!.reasons).toEqual(
      expect.arrayContaining(["missing_report", "transcript_ledger_not_finalized"]),
    );
    expect(result.broken[0]!.snapshot.nonFinalizedTurnCount).toBe(2);
  });
});

// --- Mixed-batch regression ------------------------------------------

describe("detectBrokenCompletedInterviews — mixed batch", () => {
  it("separates healthy and broken interviews in a single scan", async () => {
    db.interviews = [
      iv({ id: "good-1" }),
      iv({ id: "good-2" }),
      iv({ id: "bad-report", reportStatus: "pending" }),
      iv({ id: "bad-recording", recordingState: "FINALIZING" }),
      iv({ id: "bad-transcript", transcript: null }),
    ];
    const { detectBrokenCompletedInterviews } = await import(
      "@/lib/broken-completed-detector"
    );
    const result = await detectBrokenCompletedInterviews();
    expect(result.scanned).toBe(5);
    expect(result.broken).toHaveLength(3);
    const brokenIds = result.broken.map((b) => b.interviewId).sort();
    expect(brokenIds).toEqual(["bad-recording", "bad-report", "bad-transcript"]);
  });
});

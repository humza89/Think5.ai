/**
 * lib/broken-completed-detector — invariants A–D over an in-memory Prisma shim.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  status: string;
  completedAt: Date | null;
  reportStatus: string | null;
  reportRetryCount: number;
  recordingState: string | null;
  recordingUrl: string | null;
  transcript: unknown;
}

const db = { interviews: [] as Row[], turns: [] as { interviewId: string; finalized: boolean }[] };

function within(row: Row, where: Record<string, unknown>): boolean {
  if (where.status && row.status !== where.status) return false;
  const c = where.completedAt as { gte?: Date; lt?: Date } | undefined;
  if (c) {
    if (c.gte && (!row.completedAt || row.completedAt < c.gte)) return false;
    if (c.lt && (!row.completedAt || row.completedAt >= c.lt)) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const rows = db.interviews.filter((r) => within(r, args.where));
        return args.take ? rows.slice(0, args.take) : rows;
      },
    },
    interviewTranscript: {
      count: async (args: { where: { interviewId: string; finalized: boolean } }) =>
        db.turns.filter((t) => t.interviewId === args.where.interviewId && t.finalized === args.where.finalized).length,
    },
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

function iv(over: Partial<Row>): Row {
  return Object.assign(
    {
      id: "iv",
      status: "COMPLETED",
      completedAt: new Date(Date.now() - 30 * 60 * 1000),
      reportStatus: "completed",
      reportRetryCount: 0,
      recordingState: "COMPLETE",
      recordingUrl: "https://r2/iv",
      transcript: [{ role: "interviewer", content: "hi" }],
    },
    over,
  );
}

async function run(opts?: Parameters<typeof import("@/lib/broken-completed-detector").detectBrokenCompletedInterviews>[0]) {
  const { detectBrokenCompletedInterviews } = await import("@/lib/broken-completed-detector");
  return detectBrokenCompletedInterviews(opts);
}

beforeEach(() => {
  db.interviews = [];
  db.turns = [];
  vi.resetModules();
});

describe("window", () => {
  it("reports nothing when every interview is healthy", async () => {
    db.interviews = [iv({ id: "a" }), iv({ id: "b" })];
    const r = await run();
    expect(r.scanned).toBe(2);
    expect(r.broken).toHaveLength(0);
    expect(r.reasonBreakdown).toEqual({});
  });

  it("ignores interviews inside the grace window", async () => {
    db.interviews = [iv({ id: "fresh", completedAt: new Date(Date.now() - 30_000), reportStatus: "pending", recordingState: "UPLOADING" })];
    const r = await run();
    expect(r.scanned).toBe(0);
  });

  it("ignores interviews older than the lookback window", async () => {
    db.interviews = [iv({ id: "old", completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), reportStatus: null })];
    expect((await run()).scanned).toBe(0);
  });

  it("only scans COMPLETED interviews", async () => {
    db.interviews = [iv({ id: "live", status: "IN_PROGRESS", reportStatus: null })];
    expect((await run()).scanned).toBe(0);
  });
});

describe("invariant A — report", () => {
  it.each([null, "pending"])("flags reportStatus=%j as missing_report", async (reportStatus) => {
    db.interviews = [iv({ id: "r", reportStatus })];
    expect((await run()).broken[0]!.reasons).toContain("missing_report");
  });

  it("flags generating only after 10 minutes", async () => {
    db.interviews = [
      iv({ id: "fresh-gen", reportStatus: "generating", completedAt: new Date(Date.now() - 6 * 60_000) }),
      iv({ id: "stuck-gen", reportStatus: "generating", completedAt: new Date(Date.now() - 20 * 60_000) }),
    ];
    const ids = Object.fromEntries((await run()).broken.map((b) => [b.interviewId, b]));
    expect(ids["fresh-gen"]).toBeUndefined();
    expect(ids["stuck-gen"]!.reasons).toContain("report_stuck_generating");
  });

  it("flags failed reports only while retries remain", async () => {
    db.interviews = [
      iv({ id: "retriable", reportStatus: "failed", reportRetryCount: 2 }),
      iv({ id: "terminal", reportStatus: "failed", reportRetryCount: 5 }),
    ];
    const ids = (await run()).broken.map((b) => b.interviewId);
    expect(ids).toEqual(["retriable"]);
  });
});

describe("invariant B — recording", () => {
  it("flags a recordingUrl whose state is not COMPLETE/VERIFIED", async () => {
    db.interviews = [iv({ id: "up", recordingState: "UPLOADING" })];
    expect((await run()).broken[0]!.reasons).toContain("recording_not_complete");
  });

  it("does not flag an interview with no recording at all", async () => {
    db.interviews = [iv({ id: "none", recordingUrl: null, recordingState: null })];
    expect((await run()).broken).toHaveLength(0);
  });

  it("accepts VERIFIED", async () => {
    db.interviews = [iv({ id: "v", recordingState: "VERIFIED" })];
    expect((await run()).broken).toHaveLength(0);
  });
});

describe("invariant C — transcript", () => {
  it.each([null, []])("flags transcript=%j as missing", async (transcript) => {
    db.interviews = [iv({ id: "t", transcript })];
    expect((await run()).broken[0]!.reasons).toContain("transcript_json_missing");
  });
});

describe("invariant D — ledger", () => {
  it("does not query the ledger for otherwise healthy rows", async () => {
    db.interviews = [iv({ id: "clean" })];
    db.turns = [{ interviewId: "clean", finalized: false }];
    expect((await run()).broken).toHaveLength(0);
  });

  it("adds transcript_ledger_not_finalized when another breakage is present", async () => {
    db.interviews = [iv({ id: "both", reportStatus: "pending" })];
    db.turns = [{ interviewId: "both", finalized: false }, { interviewId: "both", finalized: false }];
    const b = (await run()).broken[0]!;
    expect(b.reasons).toEqual(expect.arrayContaining(["missing_report", "transcript_ledger_not_finalized"]));
    expect(b.snapshot.nonFinalizedTurnCount).toBe(2);
  });
});

describe("mixed batch", () => {
  it("separates healthy and broken rows and tallies reasons", async () => {
    db.interviews = [
      iv({ id: "good-1" }),
      iv({ id: "good-2" }),
      iv({ id: "bad-report", reportStatus: "pending" }),
      iv({ id: "bad-recording", recordingState: "FINALIZING" }),
      iv({ id: "bad-transcript", transcript: null }),
    ];
    const r = await run();
    expect(r.scanned).toBe(5);
    expect(r.broken.map((b) => b.interviewId).sort()).toEqual(["bad-recording", "bad-report", "bad-transcript"]);
    expect(r.reasonBreakdown).toEqual({ missing_report: 1, recording_not_complete: 1, transcript_json_missing: 1 });
  });

  it("honours the limit", async () => {
    db.interviews = [iv({ id: "1", reportStatus: null }), iv({ id: "2", reportStatus: null }), iv({ id: "3", reportStatus: null })];
    expect((await run({ limit: 2 })).scanned).toBe(2);
  });
});

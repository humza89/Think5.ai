/**
 * Track-1 correctness tests for lib/data-retention.ts.
 *
 * These tests lock in the fix that gates retention on report state. The
 * old behavior could delete a transcript while a report was still being
 * generated, producing permanent "no transcript" failures. See docs/audit
 * Track 1, Task 3.
 *
 * We mock Prisma at the module level so the test only exercises the
 * retention function's query shape and the REPORT_STATE_SAFE_FOR_RETENTION
 * predicate. A full end-to-end retention test against a live database
 * belongs in __tests__/integration/.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Prisma mock ------------------------------------------------------

interface FakeInterview {
  id: string;
  recordingUrl: string | null;
  completedAt: Date;
  transcript: unknown;
  status: string;
  candidateId: string;
  reportStatus: string | null;
  reportRetryCount: number;
}

// In-memory "database". Tests reset this per-case.
const db = {
  interviews: [] as FakeInterview[],
};

// Very small query evaluator that understands the subset of Prisma filter
// shapes the retention function actually uses. Not a general Prisma
// emulator — just enough to make the tests expressive.
function matches(row: FakeInterview, where: Record<string, unknown>): boolean {
  for (const [key, clause] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(clause)) {
      if (!clause.some((c) => matches(row, c as Record<string, unknown>))) return false;
      continue;
    }
    if (key === "AND" && Array.isArray(clause)) {
      if (!clause.every((c) => matches(row, c as Record<string, unknown>))) return false;
      continue;
    }
    if (key === "NOT" && clause && typeof clause === "object") {
      if (matches(row, clause as Record<string, unknown>)) return false;
      continue;
    }
    const value = (row as unknown as Record<string, unknown>)[key];
    if (clause && typeof clause === "object") {
      const c = clause as Record<string, unknown>;
      if ("not" in c) {
        // Special-case Prisma.DbNull sentinel
        if (typeof c.not === "object" && c.not && (c.not as { _t?: string })._t === "DbNull") {
          if (value === null || value === undefined) return false;
          continue;
        }
        if (value === c.not) return false;
        continue;
      }
      if ("lt" in c && value instanceof Date && c.lt instanceof Date) {
        if (!(value < c.lt)) return false;
        continue;
      }
      if ("gte" in c) {
        if (typeof value === "number" && typeof c.gte === "number") {
          if (!(value >= c.gte)) return false;
          continue;
        }
      }
      return false; // unknown operator — be conservative
    } else {
      if (value !== clause) return false;
    }
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    retentionPolicy: {
      findFirst: async () => ({
        isDefault: true,
        recordingDays: 30,
        transcriptDays: 30,
        candidateDataDays: 30,
      }),
    },
    interview: {
      findMany: async (args: { where: Record<string, unknown>; select?: unknown; distinct?: unknown }) => {
        return db.interviews.filter((i) => matches(i, args.where));
      },
      count: async (args: { where: Record<string, unknown> }) => {
        return db.interviews.filter((i) => matches(i, args.where)).length;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const toUpdate = db.interviews.filter((i) => matches(i, args.where));
        for (const row of toUpdate) {
          Object.assign(row, args.data);
        }
        return { count: toUpdate.length };
      },
    },
    candidate: {
      updateMany: async () => ({ count: 0 }),
    },
    activityLog: {
      deleteMany: async () => ({ count: 0 }),
    },
  },
  Prisma: {
    DbNull: { _t: "DbNull" },
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    DbNull: { _t: "DbNull" },
  },
}));

vi.mock("@/lib/media-storage", () => ({
  deleteRecording: vi.fn(async () => {}),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function iv(overrides: Partial<FakeInterview>): FakeInterview {
  const base: FakeInterview = {
    id: "iv",
    recordingUrl: "https://r2/url",
    completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    transcript: { foo: "bar" },
    status: "COMPLETED",
    candidateId: "cand-1",
    reportStatus: "completed",
    reportRetryCount: 0,
  };
  // Use Object.assign so an explicit `reportStatus: null` in overrides
  // actually wins — `?? "completed"` was the trap that made the null-case
  // test vacuously pass in the first authoring pass.
  return Object.assign(base, overrides);
}

beforeEach(() => {
  db.interviews = [];
});

// --- Predicate shape --------------------------------------------------

describe("REPORT_STATE_SAFE_FOR_RETENTION", () => {
  it("has the expected Prisma filter shape", async () => {
    const { REPORT_STATE_SAFE_FOR_RETENTION } = await import("@/lib/data-retention");
    expect(REPORT_STATE_SAFE_FOR_RETENTION).toEqual({
      OR: [
        { reportStatus: "completed" },
        {
          AND: [
            { reportStatus: "failed" },
            { reportRetryCount: { gte: 5 } },
          ],
        },
      ],
    });
  });
});

// --- Behavioral tests -------------------------------------------------

describe("applyRetentionPolicies — report-state gate", () => {
  it("deletes transcripts for interviews with reportStatus=completed past the cutoff", async () => {
    db.interviews = [iv({ id: "iv-completed", reportStatus: "completed" })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");

    const result = await applyRetentionPolicies();

    expect(result.transcriptsCleared).toBe(1);
    expect(result.skippedDueToReport).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ _t: "DbNull" });
  });

  it("SKIPS transcripts for interviews where reportStatus=generating (the core fix)", async () => {
    db.interviews = [iv({ id: "iv-stuck", reportStatus: "generating" })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");

    const result = await applyRetentionPolicies();

    expect(result.transcriptsCleared).toBe(0);
    expect(result.skippedDueToReport).toBeGreaterThan(0);
    // Transcript must be unchanged — this is the invariant that was broken.
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("SKIPS transcripts for interviews where reportStatus=pending", async () => {
    db.interviews = [iv({ id: "iv-pending", reportStatus: "pending" })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("SKIPS transcripts for interviews where reportStatus=null (never initiated)", async () => {
    db.interviews = [iv({ id: "iv-null", reportStatus: null })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("SKIPS a failed report that still has retries remaining", async () => {
    db.interviews = [iv({ id: "iv-retryable", reportStatus: "failed", reportRetryCount: 2 })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("DELETES a failed report once retries are exhausted (reportRetryCount >= 5)", async () => {
    db.interviews = [iv({ id: "iv-terminal-fail", reportStatus: "failed", reportRetryCount: 5 })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(1);
    expect(db.interviews[0]!.transcript).toEqual({ _t: "DbNull" });
  });

  it("does not delete interviews that are within the cutoff window, regardless of report state", async () => {
    db.interviews = [
      iv({
        id: "iv-recent",
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        reportStatus: "completed",
      }),
    ];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("mixed batch: only the completed-report rows are cleared, stuck ones are counted", async () => {
    db.interviews = [
      iv({ id: "a", reportStatus: "completed" }),
      iv({ id: "b", reportStatus: "generating" }),
      iv({ id: "c", reportStatus: "pending" }),
      iv({ id: "d", reportStatus: "completed" }),
      iv({ id: "e", reportStatus: "failed", reportRetryCount: 5 }),
    ];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();

    expect(result.transcriptsCleared).toBe(3); // a, d, e
    expect(result.skippedDueToReport).toBeGreaterThanOrEqual(2); // b, c (may be counted per-stage)

    // Confirm row-level outcomes
    const byId: Record<string, FakeInterview> = Object.fromEntries(db.interviews.map((i) => [i.id, i]));
    expect(byId.a!.transcript).toEqual({ _t: "DbNull" });
    expect(byId.b!.transcript).toEqual({ foo: "bar" });
    expect(byId.c!.transcript).toEqual({ foo: "bar" });
    expect(byId.d!.transcript).toEqual({ _t: "DbNull" });
    expect(byId.e!.transcript).toEqual({ _t: "DbNull" });
  });
});

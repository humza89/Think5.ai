/**
 * lib/data-retention — report-state gate.
 *
 * Retention must never clear evidence for an interview whose report is still
 * pending/generating/retrying. Prisma is mocked with a tiny filter evaluator
 * that understands the subset of operators the retention query uses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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

const db = { interviews: [] as FakeInterview[] };
const DB_NULL = { _t: "DbNull" };

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
        if (c.not === DB_NULL || c.not === null) {
          if (value === null || value === undefined || value === DB_NULL) return false;
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
        if (value instanceof Date && c.gte instanceof Date) {
          if (!(value >= c.gte)) return false;
          continue;
        }
        if (typeof value === "number" && typeof c.gte === "number") {
          if (!(value >= c.gte)) return false;
          continue;
        }
        return false;
      }
      if ("in" in c && Array.isArray(c.in)) {
        if (!c.in.includes(value)) return false;
        continue;
      }
      return false;
    }
    if (value !== clause) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    retentionPolicy: {
      findFirst: async () => ({ isDefault: true, recordingDays: 30, transcriptDays: 30, candidateDataDays: 30 }),
    },
    interview: {
      findMany: async (args: { where: Record<string, unknown> }) => db.interviews.filter((i) => matches(i, args.where)),
      count: async (args: { where: Record<string, unknown> }) => db.interviews.filter((i) => matches(i, args.where)).length,
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = db.interviews.filter((i) => matches(i, args.where));
        for (const row of rows) Object.assign(row, args.data);
        return { count: rows.length };
      },
    },
    candidate: { updateMany: async () => ({ count: 0 }) },
    activityLog: { deleteMany: async () => ({ count: 0 }) },
  },
}));

vi.mock("@prisma/client", () => ({ Prisma: { DbNull: DB_NULL } }));
vi.mock("@/lib/media-storage", () => ({ deleteRecording: vi.fn(async () => {}) }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

function iv(overrides: Partial<FakeInterview>): FakeInterview {
  return Object.assign(
    {
      id: "iv",
      recordingUrl: "https://r2/url",
      completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      transcript: { foo: "bar" },
      status: "COMPLETED",
      candidateId: "cand-1",
      reportStatus: "completed",
      reportRetryCount: 0,
    },
    overrides,
  );
}

beforeEach(() => {
  db.interviews = [];
});

describe("REPORT_STATE_SAFE_FOR_RETENTION", () => {
  it("has the expected Prisma filter shape", async () => {
    const { REPORT_STATE_SAFE_FOR_RETENTION } = await import("@/lib/data-retention");
    expect(REPORT_STATE_SAFE_FOR_RETENTION).toEqual({
      OR: [{ reportStatus: "completed" }, { AND: [{ reportStatus: "failed" }, { reportRetryCount: { gte: 5 } }] }],
    });
  });
});

describe("applyRetentionPolicies — report-state gate", () => {
  it("clears transcript and recording for a completed report past the cutoff", async () => {
    db.interviews = [iv({ id: "done" })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(1);
    expect(result.recordingsCleared).toBe(1);
    expect(result.skippedDueToReport).toBe(0);
    expect(db.interviews[0]!.transcript).toBe(DB_NULL);
    expect(db.interviews[0]!.recordingUrl).toBeNull();
  });

  it.each(["generating", "pending", null])("skips evidence while reportStatus is %j", async (reportStatus) => {
    db.interviews = [iv({ id: "stuck", reportStatus })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(result.recordingsCleared).toBe(0);
    expect(result.skippedDueToReport).toBe(2); // counted once per stage (recording + transcript)
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
    expect(db.interviews[0]!.recordingUrl).toBe("https://r2/url");
  });

  it("skips a failed report that still has retries left", async () => {
    db.interviews = [iv({ id: "retryable", reportStatus: "failed", reportRetryCount: 2 })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(db.interviews[0]!.transcript).toEqual({ foo: "bar" });
  });

  it("clears a terminally failed report (reportRetryCount >= 5)", async () => {
    db.interviews = [iv({ id: "terminal", reportStatus: "failed", reportRetryCount: 5 })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(1);
    expect(db.interviews[0]!.transcript).toBe(DB_NULL);
  });

  it("leaves rows inside the cutoff untouched regardless of report state", async () => {
    db.interviews = [iv({ id: "recent", completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(0);
    expect(result.skippedDueToReport).toBe(0);
  });

  it("mixed batch: only durable/terminal rows are cleared, the rest are counted", async () => {
    db.interviews = [
      iv({ id: "a", reportStatus: "completed" }),
      iv({ id: "b", reportStatus: "generating" }),
      iv({ id: "c", reportStatus: "pending" }),
      iv({ id: "d", reportStatus: "completed" }),
      iv({ id: "e", reportStatus: "failed", reportRetryCount: 5 }),
    ];
    const { applyRetentionPolicies } = await import("@/lib/data-retention");
    const result = await applyRetentionPolicies();
    expect(result.transcriptsCleared).toBe(3);
    expect(result.skippedDueToReport).toBe(4);
    const byId = Object.fromEntries(db.interviews.map((i) => [i.id, i]));
    expect(byId.a!.transcript).toBe(DB_NULL);
    expect(byId.b!.transcript).toEqual({ foo: "bar" });
    expect(byId.c!.transcript).toEqual({ foo: "bar" });
    expect(byId.d!.transcript).toBe(DB_NULL);
    expect(byId.e!.transcript).toBe(DB_NULL);
  });
});

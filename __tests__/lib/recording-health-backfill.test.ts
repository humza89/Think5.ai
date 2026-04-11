/**
 * Track 4 Task 15 tests for lib/recording-health-backfill.ts.
 *
 * Covers the legacy-row backfill logic with a mocked Prisma shim. The
 * invariants under test are:
 *   1. Rows with recordingHealth !== 'NONE' are not touched.
 *   2. Rows with recordingUrl = null are not touched.
 *   3. Legacy rows are classified conservatively — nothing becomes
 *      HEALTHY without runtime evidence.
 *   4. dryRun=true classifies but does not write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRow {
  id: string;
  recordingUrl: string | null;
  recordingState: string | null;
  recordingSize: number | null;
  recordingHealth: string;
  recordingHealthReason: string | null;
  recordingHealthAt: Date | null;
  createdAt: Date;
}

const db: { rows: FakeRow[] } = { rows: [] };

function matchWhere(row: FakeRow, where: Record<string, unknown>): boolean {
  if (where.recordingHealth && row.recordingHealth !== where.recordingHealth) {
    return false;
  }
  // Prisma shape: recordingUrl: { not: null }
  if (where.recordingUrl && typeof where.recordingUrl === "object") {
    const c = where.recordingUrl as { not?: unknown };
    if ("not" in c && c.not === null) {
      // The filter is "recordingUrl IS NOT NULL". Exclude null rows.
      if (row.recordingUrl === null) return false;
    }
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const hits = db.rows.filter((r) => matchWhere(r, args.where));
        return args.take ? hits.slice(0, args.take) : hits;
      },
      update: async (args: {
        where: { id: string };
        data: { recordingHealth: string; recordingHealthReason: string; recordingHealthAt: Date };
      }) => {
        const row = db.rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error(`not found: ${args.where.id}`);
        row.recordingHealth = args.data.recordingHealth;
        row.recordingHealthReason = args.data.recordingHealthReason;
        row.recordingHealthAt = args.data.recordingHealthAt;
        return row;
      },
      findUnique: async () => null,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function row(over: Partial<FakeRow>): FakeRow {
  const base: FakeRow = {
    id: "iv",
    recordingUrl: "https://r2/iv",
    recordingState: "COMPLETE",
    recordingSize: 5_000_000,
    recordingHealth: "NONE",
    recordingHealthReason: null,
    recordingHealthAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  // Object.assign so explicit null in `over` wins — the ?? trap was
  // coercing null back to the default.
  return Object.assign(base, over);
}

beforeEach(() => {
  db.rows = [];
  vi.resetModules();
});

describe("runRecordingHealthBackfill", () => {
  it("returns empty report when no candidates exist", async () => {
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.scanned).toBe(0);
    expect(report.degraded).toBe(0);
  });

  it("classifies legacy COMPLETE as DEGRADED (not HEALTHY)", async () => {
    db.rows = [row({ id: "legacy-complete", recordingState: "COMPLETE" })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.scanned).toBe(1);
    expect(report.degraded).toBe(1);
    expect(report.healthy).toBe(0);
    // And the row is actually written
    expect(db.rows[0]!.recordingHealth).toBe("DEGRADED");
  });

  it("classifies legacy UPLOADING as PROCESSING", async () => {
    db.rows = [row({ id: "upload", recordingState: "UPLOADING" })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.processing).toBe(1);
    expect(db.rows[0]!.recordingHealth).toBe("PROCESSING");
  });

  it("classifies legacy DELETED as MISSING", async () => {
    db.rows = [row({ id: "deleted", recordingState: "DELETED", recordingSize: 0 })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.missing).toBe(1);
  });

  it("classifies legacy null state + zero size as FAILED", async () => {
    db.rows = [row({ id: "bust", recordingState: null, recordingSize: 0 })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.failed).toBe(1);
  });

  it("IGNORES rows that already have a non-NONE recordingHealth (idempotent)", async () => {
    db.rows = [
      row({ id: "already-healthy", recordingHealth: "HEALTHY" }),
      row({ id: "already-degraded", recordingHealth: "DEGRADED" }),
      row({ id: "fresh-legacy", recordingHealth: "NONE", recordingState: "COMPLETE" }),
    ];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    // Only the one row with NONE is scanned.
    expect(report.scanned).toBe(1);
    // And only that row changes.
    expect(db.rows[0]!.recordingHealth).toBe("HEALTHY");
    expect(db.rows[1]!.recordingHealth).toBe("DEGRADED");
    expect(db.rows[2]!.recordingHealth).toBe("DEGRADED");
  });

  it("IGNORES rows with recordingUrl = null (no recording to classify)", async () => {
    db.rows = [row({ id: "no-rec", recordingUrl: null })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.scanned).toBe(0);
    expect(db.rows[0]!.recordingHealth).toBe("NONE");
  });

  it("dryRun=true classifies but does not write", async () => {
    db.rows = [row({ id: "dry", recordingState: "COMPLETE" })];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill({ dryRun: true });
    expect(report.degraded).toBe(1);
    // Row still NONE since dryRun didn't persist
    expect(db.rows[0]!.recordingHealth).toBe("NONE");
  });

  it("mixed batch: each legacy row lands in the correct bucket", async () => {
    db.rows = [
      row({ id: "complete-1", recordingState: "COMPLETE" }),
      row({ id: "complete-2", recordingState: "VERIFIED" }),
      row({ id: "uploading", recordingState: "UPLOADING" }),
      row({ id: "deleted", recordingState: "DELETED", recordingSize: 0 }),
      row({ id: "busted", recordingState: null, recordingSize: 0 }),
      row({ id: "already", recordingHealth: "HEALTHY", recordingState: "COMPLETE" }),
    ];
    const { runRecordingHealthBackfill } = await import(
      "@/lib/recording-health-backfill"
    );
    const report = await runRecordingHealthBackfill();
    expect(report.scanned).toBe(5);
    expect(report.degraded).toBe(2);
    expect(report.processing).toBe(1);
    expect(report.missing).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.healthy).toBe(0); // nothing is ever auto-promoted to HEALTHY
  });
});

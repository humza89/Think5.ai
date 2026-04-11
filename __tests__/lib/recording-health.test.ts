/**
 * Track 4 Task 15 tests for lib/recording-health.ts.
 *
 * Covers the pure classifiers (healthFromMergeOutcome,
 * classifyLegacyHealth, isPlayable, isTerminal) and the Prisma writer
 * (setRecordingHealth / getRecordingHealth) with a mocked client.
 *
 * The most important invariant under test is that ONLY
 * RecordingHealth='HEALTHY' is playable — the recruiter UI must refuse
 * to show DEGRADED as if it were trustworthy. That's the whole point
 * of this module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Prisma mock ──────────────────────────────────────────────────────

interface FakeRow {
  id: string;
  recordingHealth: string;
  recordingHealthReason: string | null;
  recordingHealthAt: Date | null;
}

const db: { rows: FakeRow[] } = { rows: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      update: async (args: {
        where: { id: string };
        data: { recordingHealth: string; recordingHealthReason: string; recordingHealthAt: Date };
      }) => {
        let row = db.rows.find((r) => r.id === args.where.id);
        if (!row) {
          row = {
            id: args.where.id,
            recordingHealth: "NONE",
            recordingHealthReason: null,
            recordingHealthAt: null,
          };
          db.rows.push(row);
        }
        row.recordingHealth = args.data.recordingHealth;
        row.recordingHealthReason = args.data.recordingHealthReason;
        row.recordingHealthAt = args.data.recordingHealthAt;
        return row;
      },
      findUnique: async (args: { where: { id: string } }) => {
        return db.rows.find((r) => r.id === args.where.id) ?? null;
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  db.rows = [];
  vi.resetModules();
});

// ── Pure classifier tests ────────────────────────────────────────────

describe("isPlayable / isTerminal", () => {
  it("ONLY HEALTHY is playable", async () => {
    const { isPlayable } = await import("@/lib/recording-health");
    expect(isPlayable("HEALTHY")).toBe(true);
    // Every other value must refuse playback. This is the core
    // invariant of Track 4.
    expect(isPlayable("NONE")).toBe(false);
    expect(isPlayable("PROCESSING")).toBe(false);
    expect(isPlayable("DEGRADED")).toBe(false);
    expect(isPlayable("MISSING")).toBe(false);
    expect(isPlayable("FAILED")).toBe(false);
  });

  it("DEGRADED / MISSING / FAILED are terminal states", async () => {
    const { isTerminal } = await import("@/lib/recording-health");
    expect(isTerminal("DEGRADED")).toBe(true);
    expect(isTerminal("MISSING")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("HEALTHY")).toBe(false);
    expect(isTerminal("PROCESSING")).toBe(false);
    expect(isTerminal("NONE")).toBe(false);
  });
});

describe("healthFromMergeOutcome", () => {
  it("mergeSucceeded + URL resolved → HEALTHY", async () => {
    const { healthFromMergeOutcome } = await import("@/lib/recording-health");
    const r = healthFromMergeOutcome({
      mergeSucceeded: true,
      playbackUrlResolved: true,
      totalChunks: 5,
    });
    expect(r.health).toBe("HEALTHY");
    expect(r.reason).toMatch(/merge_succeeded/);
  });

  it("mergeSucceeded but URL missing → MISSING", async () => {
    const { healthFromMergeOutcome } = await import("@/lib/recording-health");
    const r = healthFromMergeOutcome({
      mergeSucceeded: true,
      playbackUrlResolved: false,
      totalChunks: 5,
    });
    expect(r.health).toBe("MISSING");
  });

  it("merge failed with no chunks → FAILED", async () => {
    const { healthFromMergeOutcome } = await import("@/lib/recording-health");
    const r = healthFromMergeOutcome({
      mergeSucceeded: false,
      playbackUrlResolved: false,
      totalChunks: 0,
    });
    expect(r.health).toBe("FAILED");
    expect(r.reason).toMatch(/no_chunks/);
  });

  it("merge failed but chunks exist → DEGRADED (recoverable)", async () => {
    const { healthFromMergeOutcome } = await import("@/lib/recording-health");
    const r = healthFromMergeOutcome({
      mergeSucceeded: false,
      playbackUrlResolved: false,
      totalChunks: 10,
    });
    expect(r.health).toBe("DEGRADED");
  });
});

describe("classifyLegacyHealth — conservative mapping", () => {
  it("returns NONE when recordingUrl is null", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    const r = classifyLegacyHealth({
      recordingUrl: null,
      recordingState: null,
      recordingSize: null,
    });
    expect(r.health).toBe("NONE");
  });

  it("returns PROCESSING for UPLOADING", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: "UPLOADING",
        recordingSize: 1000,
      }).health,
    ).toBe("PROCESSING");
  });

  it("returns PROCESSING for FINALIZING", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: "FINALIZING",
        recordingSize: 1000,
      }).health,
    ).toBe("PROCESSING");
  });

  it("returns MISSING for DELETED", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: "DELETED",
        recordingSize: 0,
      }).health,
    ).toBe("MISSING");
  });

  it("returns DEGRADED (not HEALTHY) for legacy COMPLETE — the key safety rule", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    // Legacy COMPLETE is intentionally marked DEGRADED — the pre-Track-1
    // media-storage.ts wrote COMPLETE even on silent first-chunk
    // fallbacks, so we cannot trust legacy COMPLETE as healthy without
    // re-verification.
    const r = classifyLegacyHealth({
      recordingUrl: "https://r2/iv",
      recordingState: "COMPLETE",
      recordingSize: 5_000_000,
    });
    expect(r.health).toBe("DEGRADED");
    expect(r.reason).toMatch(/unverified_merge/);
  });

  it("returns DEGRADED for legacy VERIFIED as well (same reason)", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: "VERIFIED",
        recordingSize: 5_000_000,
      }).health,
    ).toBe("DEGRADED");
  });

  it("returns FAILED when state is null and size is zero", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: null,
        recordingSize: 0,
      }).health,
    ).toBe("FAILED");
  });

  it("returns FAILED for COMPLETE with zero size (pipeline lied)", async () => {
    const { classifyLegacyHealth } = await import("@/lib/recording-health");
    expect(
      classifyLegacyHealth({
        recordingUrl: "https://r2/iv",
        recordingState: "COMPLETE",
        recordingSize: 0,
      }).health,
    ).toBe("FAILED");
  });
});

// ── Persistence tests ────────────────────────────────────────────────

describe("setRecordingHealth / getRecordingHealth", () => {
  it("writes then reads back the value", async () => {
    const { setRecordingHealth, getRecordingHealth } = await import(
      "@/lib/recording-health"
    );
    await setRecordingHealth("iv-1", "HEALTHY", "merge_succeeded_url_resolved");
    const r = await getRecordingHealth("iv-1");
    expect(r).toBeTruthy();
    expect(r!.health).toBe("HEALTHY");
    expect(r!.reason).toBe("merge_succeeded_url_resolved");
    expect(r!.at).toBeInstanceOf(Date);
  });

  it("overwrites on repeat call (idempotent on value, refreshes at)", async () => {
    const { setRecordingHealth, getRecordingHealth } = await import(
      "@/lib/recording-health"
    );
    await setRecordingHealth("iv-2", "PROCESSING", "finalize_started");
    await setRecordingHealth("iv-2", "HEALTHY", "merge_ok");
    const r = await getRecordingHealth("iv-2");
    expect(r!.health).toBe("HEALTHY");
    expect(r!.reason).toBe("merge_ok");
  });

  it("returns null for a non-existent interview", async () => {
    const { getRecordingHealth } = await import("@/lib/recording-health");
    expect(await getRecordingHealth("ghost")).toBeNull();
  });
});

/**
 * Track 2 Task 10 correctness tests for lib/finalization-reconciler.ts.
 *
 * Locks in the repair decision tree. These tests run with dryRun=true
 * so we can assert the DECISION without needing to mock every side-
 * effect; the counters in the ReconcilerReport tell us which branch
 * would have fired.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManifestRecord } from "@/lib/finalization-manifest";

// --- Shared state ----------------------------------------------------

interface FakeStuckInterview {
  id: string;
  updatedAt: Date;
  recordingState: string | null;
  recordingUrl: string | null;
}

const stuckInterviews: FakeStuckInterview[] = [];
const manifests: Record<string, ManifestRecord> = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findMany: async (args: { where: { updatedAt: { lt: Date } }; take?: number }) => {
        const matching = stuckInterviews.filter((i) => i.updatedAt < args.where.updatedAt.lt);
        return args.take ? matching.slice(0, args.take) : matching;
      },
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/finalization-manifest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/finalization-manifest")>(
    "@/lib/finalization-manifest",
  );
  return {
    ...actual,
    getManifest: async (interviewId: string) => manifests[interviewId] ?? null,
    markSatisfied: vi.fn(async () => null),
    markFailed: vi.fn(async () => null),
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(async () => ({})) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function manifest(over: Partial<ManifestRecord>): ManifestRecord {
  return {
    interviewId: over.interviewId ?? "iv",
    state: "in_flight",
    ledgerStatus: "finalized",
    recordingStatus: "merged",
    reportStatus: "pending",
    auditStatus: "complete",
    reason: null,
    attemptCount: 1,
    startedAt: new Date(Date.now() - 20 * 60_000),
    updatedAt: new Date(Date.now() - 20 * 60_000),
    satisfiedAt: null,
    failedAt: null,
    ...over,
  };
}

function stuck(id: string, ageMin: number): FakeStuckInterview {
  return {
    id,
    updatedAt: new Date(Date.now() - ageMin * 60_000),
    recordingState: "COMPLETE",
    recordingUrl: "https://r2/iv",
  };
}

beforeEach(() => {
  stuckInterviews.length = 0;
  for (const k of Object.keys(manifests)) delete manifests[k];
  vi.resetModules();
});

// --- Tests -----------------------------------------------------------

describe("reconcileStuckFinalizations — repair decision tree", () => {
  it("returns an empty report when no interviews are stuck", async () => {
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.scanned).toBe(0);
    expect(report.forcedComplete).toBe(0);
  });

  it("Case A: force-completes when the manifest is satisfied (forcedComplete counter bumped)", async () => {
    stuckInterviews.push(stuck("iv-a", 20));
    manifests["iv-a"] = manifest({
      interviewId: "iv-a",
      ledgerStatus: "finalized",
      recordingStatus: "merged",
      reportStatus: "completed",
    });
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.scanned).toBe(1);
    expect(report.forcedComplete).toBe(1);
    expect(report.terminallyFailed).toBe(0);
  });

  it("Case B: re-triggers report dispatch when manifest.reportStatus='not_started'", async () => {
    stuckInterviews.push(stuck("iv-b", 20));
    manifests["iv-b"] = manifest({
      interviewId: "iv-b",
      reportStatus: "not_started",
      recordingStatus: "merged",
    });
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.reportRetriggered).toBe(1);
    expect(report.forcedComplete).toBe(0);
    expect(report.terminallyFailed).toBe(0);
  });

  it("Case C: re-triggers recording merge when recordingStatus='finalizing' and age > 10min", async () => {
    stuckInterviews.push(stuck("iv-c", 20));
    manifests["iv-c"] = manifest({
      interviewId: "iv-c",
      recordingStatus: "finalizing",
      startedAt: new Date(Date.now() - 20 * 60_000),
      reportStatus: "pending",
    });
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.mergeRetriggered).toBe(1);
  });

  it("Case D: terminal-fails interviews stuck for more than TERMINAL_FAIL_AFTER_MIN", async () => {
    stuckInterviews.push(stuck("iv-d", 120));
    manifests["iv-d"] = manifest({
      interviewId: "iv-d",
      startedAt: new Date(Date.now() - 120 * 60_000),
      reportStatus: "not_started",
      recordingStatus: "finalizing",
    });
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.terminallyFailed).toBe(1);
    // Terminal fail short-circuits — no re-trigger actions counted.
    expect(report.reportRetriggered).toBe(0);
    expect(report.mergeRetriggered).toBe(0);
  });

  it("interviews without a manifest are reported as stillStuck (needs manual inspection)", async () => {
    stuckInterviews.push(stuck("iv-no-manifest", 20));
    // Don't seed a manifest.
    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.stillStuck).toBe(1);
    expect(report.forcedComplete).toBe(0);
  });

  it("mixed batch: runs each repair branch on the appropriate interview", async () => {
    stuckInterviews.push(stuck("ok", 20));
    stuckInterviews.push(stuck("needs-report", 20));
    stuckInterviews.push(stuck("needs-merge", 20));
    stuckInterviews.push(stuck("terminal", 120));

    manifests["ok"] = manifest({
      interviewId: "ok",
      ledgerStatus: "finalized",
      recordingStatus: "merged",
      reportStatus: "completed",
    });
    manifests["needs-report"] = manifest({
      interviewId: "needs-report",
      reportStatus: "not_started",
      recordingStatus: "merged",
    });
    manifests["needs-merge"] = manifest({
      interviewId: "needs-merge",
      recordingStatus: "finalizing",
      startedAt: new Date(Date.now() - 20 * 60_000),
      reportStatus: "pending",
    });
    manifests["terminal"] = manifest({
      interviewId: "terminal",
      startedAt: new Date(Date.now() - 120 * 60_000),
      reportStatus: "not_started",
      recordingStatus: "finalizing",
    });

    const { reconcileStuckFinalizations } = await import("@/lib/finalization-reconciler");
    const report = await reconcileStuckFinalizations({ dryRun: true });
    expect(report.scanned).toBe(4);
    expect(report.forcedComplete).toBe(1);
    expect(report.reportRetriggered).toBe(1);
    expect(report.mergeRetriggered).toBe(1);
    expect(report.terminallyFailed).toBe(1);
  });
});

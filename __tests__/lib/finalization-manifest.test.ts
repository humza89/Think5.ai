/**
 * Track 2 Task 7 correctness tests for lib/finalization-manifest.ts.
 *
 * Locks in the atomic-completion contract. The most important test
 * is the one asserting that evaluateManifestRecord() returns
 * canComplete=false whenever ANY required stage is in a non-safe
 * status — this is the gate that prevents broken COMPLETED interviews.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateManifestRecord,
  type ManifestRecord,
} from "@/lib/finalization-manifest";

// The pure evaluator doesn't need any mocks — it's a closed function
// over a plain record.

function rec(over: Partial<ManifestRecord>): ManifestRecord {
  return {
    interviewId: "iv-1",
    state: "in_flight",
    ledgerStatus: "finalized",
    recordingStatus: "merged",
    reportStatus: "pending",
    auditStatus: "complete",
    reason: null,
    attemptCount: 1,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:05:00Z"),
    satisfiedAt: null,
    failedAt: null,
    ...over,
  };
}

describe("evaluateManifestRecord — atomic completion contract", () => {
  describe("happy path", () => {
    it("returns canComplete=true when every stage is in a safe state", () => {
      const result = evaluateManifestRecord(rec({}));
      expect(result.canComplete).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.degraded).toBe(false);
    });

    it("accepts reportStatus='pending' as safe (async report generation is allowed)", () => {
      expect(evaluateManifestRecord(rec({ reportStatus: "pending" })).canComplete).toBe(true);
    });

    it("accepts reportStatus='generating' as safe", () => {
      expect(evaluateManifestRecord(rec({ reportStatus: "generating" })).canComplete).toBe(true);
    });

    it("accepts reportStatus='completed' as safe", () => {
      expect(evaluateManifestRecord(rec({ reportStatus: "completed" })).canComplete).toBe(true);
    });

    it("accepts recordingStatus='not_applicable' as safe (no recording by design)", () => {
      expect(
        evaluateManifestRecord(rec({ recordingStatus: "not_applicable" })).canComplete,
      ).toBe(true);
    });

    it("accepts recordingStatus='degraded' as safe but flags degraded=true", () => {
      const result = evaluateManifestRecord(rec({ recordingStatus: "degraded" }));
      expect(result.canComplete).toBe(true);
      expect(result.degraded).toBe(true);
    });
  });

  describe("ledger gate", () => {
    it("blocks canComplete when ledgerStatus='not_finalized'", () => {
      const result = evaluateManifestRecord(rec({ ledgerStatus: "not_finalized" }));
      expect(result.canComplete).toBe(false);
      expect(result.missing).toContain("ledger:not_finalized");
    });

    it("blocks canComplete when ledgerStatus='integrity_failed' — the worst case", () => {
      const result = evaluateManifestRecord(rec({ ledgerStatus: "integrity_failed" }));
      expect(result.canComplete).toBe(false);
      expect(result.missing).toContain("ledger:integrity_failed");
    });
  });

  describe("recording gate", () => {
    const badStatuses = ["uploading", "finalizing", "failed"] as const;
    for (const status of badStatuses) {
      it(`blocks canComplete when recordingStatus='${status}'`, () => {
        const result = evaluateManifestRecord(rec({ recordingStatus: status }));
        expect(result.canComplete).toBe(false);
        expect(result.missing).toContain(`recording:${status}`);
      });
    }
  });

  describe("report gate", () => {
    const badStatuses = ["not_started", "failed"] as const;
    for (const status of badStatuses) {
      it(`blocks canComplete when reportStatus='${status}'`, () => {
        const result = evaluateManifestRecord(rec({ reportStatus: status }));
        expect(result.canComplete).toBe(false);
        expect(result.missing).toContain(`report:${status}`);
      });
    }
  });

  describe("multiple simultaneous failures are reported together", () => {
    it("reports every missing stage in the same call", () => {
      const result = evaluateManifestRecord(
        rec({
          ledgerStatus: "not_finalized",
          recordingStatus: "finalizing",
          reportStatus: "not_started",
        }),
      );
      expect(result.canComplete).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([
          "ledger:not_finalized",
          "recording:finalizing",
          "report:not_started",
        ]),
      );
      expect(result.missing.length).toBe(3);
    });
  });

  describe("degraded flag semantics", () => {
    it("degraded is false when recording is merged normally", () => {
      expect(evaluateManifestRecord(rec({ recordingStatus: "merged" })).degraded).toBe(false);
    });
    it("degraded is false when recording is not applicable", () => {
      expect(evaluateManifestRecord(rec({ recordingStatus: "not_applicable" })).degraded).toBe(
        false,
      );
    });
    it("degraded is true ONLY when recording is degraded AND canComplete is true", () => {
      const ok = evaluateManifestRecord(rec({ recordingStatus: "degraded" }));
      expect(ok.canComplete).toBe(true);
      expect(ok.degraded).toBe(true);

      // If some OTHER gate is blocking, degraded is not set — canComplete
      // takes precedence because there's no point talking about "degraded
      // but complete" when we can't complete at all.
      const blocked = evaluateManifestRecord(
        rec({ recordingStatus: "degraded", ledgerStatus: "not_finalized" }),
      );
      expect(blocked.canComplete).toBe(false);
      expect(blocked.degraded).toBe(false);
    });
  });
});

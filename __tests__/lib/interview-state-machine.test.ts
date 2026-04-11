import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminalState,
  getAllowedTransitions,
} from "@/lib/interview-state-machine";

describe("Interview State Machine", () => {
  describe("isValidTransition", () => {
    // Valid transitions
    //
    // Track 2 Task 8 change: IN_PROGRESS → COMPLETED and
    // DISCONNECTED → COMPLETED are NO LONGER legal. The only legal
    // path to COMPLETED is FINALIZING → COMPLETED (gated on the
    // FinalizationManifest at the application layer).
    it.each([
      ["CREATED", "PLAN_GENERATED"],
      ["CREATED", "PENDING"],
      ["CREATED", "CANCELLED"],
      ["PLAN_GENERATED", "PENDING"],
      ["PLAN_GENERATED", "CANCELLED"],
      ["PENDING", "IN_PROGRESS"],
      ["PENDING", "CANCELLED"],
      ["PENDING", "EXPIRED"],
      ["IN_PROGRESS", "FINALIZING"],
      ["IN_PROGRESS", "DISCONNECTED"],
      ["IN_PROGRESS", "PAUSED"],
      ["IN_PROGRESS", "CANCELLED"],
      ["PAUSED", "IN_PROGRESS"],
      ["PAUSED", "FINALIZING"],
      ["PAUSED", "CANCELLED"],
      ["DISCONNECTED", "IN_PROGRESS"],
      ["DISCONNECTED", "FINALIZING"],
      ["DISCONNECTED", "CANCELLED"],
      ["FINALIZING", "COMPLETED"],
      ["FINALIZING", "CANCELLED"],
      ["COMPLETED", "REPORT_GENERATING"],
      ["REPORT_GENERATING", "REPORT_READY"],
      ["REPORT_GENERATING", "REPORT_FAILED"],
      ["REPORT_FAILED", "REPORT_GENERATING"],
    ])("allows %s → %s", (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    // Invalid transitions — explicitly including the ones Track 2 Task 8 removed.
    it.each([
      ["CREATED", "COMPLETED"],
      ["CREATED", "IN_PROGRESS"],
      ["PENDING", "COMPLETED"],
      ["PENDING", "REPORT_GENERATING"],
      ["IN_PROGRESS", "PENDING"],
      ["IN_PROGRESS", "CREATED"],
      // Track 2 Task 8: direct IN_PROGRESS → COMPLETED is the bug we're
      // locking out. Must go through FINALIZING.
      ["IN_PROGRESS", "COMPLETED"],
      // Track 2 Task 8: DISCONNECTED → COMPLETED must also go via FINALIZING.
      ["DISCONNECTED", "COMPLETED"],
      // FINALIZING is one-way: cannot go back to IN_PROGRESS. Once
      // finalization begins, the interview can only end.
      ["FINALIZING", "IN_PROGRESS"],
      ["FINALIZING", "PAUSED"],
      ["COMPLETED", "IN_PROGRESS"],
      ["COMPLETED", "FINALIZING"],
      ["COMPLETED", "CANCELLED"],
      ["CANCELLED", "PENDING"],
      ["CANCELLED", "IN_PROGRESS"],
      ["EXPIRED", "PENDING"],
      ["REPORT_READY", "REPORT_GENERATING"],
      ["REPORT_READY", "COMPLETED"],
    ])("rejects %s → %s", (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });

    it("returns false for unknown states", () => {
      expect(isValidTransition("UNKNOWN", "COMPLETED")).toBe(false);
      expect(isValidTransition("CREATED", "UNKNOWN")).toBe(false);
    });
  });

  describe("isTerminalState", () => {
    it("identifies terminal states", () => {
      expect(isTerminalState("CANCELLED")).toBe(true);
      expect(isTerminalState("EXPIRED")).toBe(true);
      expect(isTerminalState("REPORT_READY")).toBe(true);
    });

    it("identifies non-terminal states", () => {
      expect(isTerminalState("CREATED")).toBe(false);
      expect(isTerminalState("IN_PROGRESS")).toBe(false);
      expect(isTerminalState("COMPLETED")).toBe(false);
      expect(isTerminalState("REPORT_FAILED")).toBe(false);
    });
  });

  describe("getAllowedTransitions", () => {
    it("returns allowed transitions for CREATED", () => {
      const allowed = getAllowedTransitions("CREATED");
      expect(allowed).toContain("PLAN_GENERATED");
      expect(allowed).toContain("PENDING");
      expect(allowed).toContain("CANCELLED");
      expect(allowed).not.toContain("COMPLETED");
    });

    it("returns empty array for terminal states", () => {
      expect(getAllowedTransitions("CANCELLED")).toEqual([]);
      expect(getAllowedTransitions("EXPIRED")).toEqual([]);
      expect(getAllowedTransitions("REPORT_READY")).toEqual([]);
    });

    it("returns empty array for unknown states", () => {
      expect(getAllowedTransitions("UNKNOWN")).toEqual([]);
    });

    it("REPORT_FAILED can retry", () => {
      const allowed = getAllowedTransitions("REPORT_FAILED");
      expect(allowed).toContain("REPORT_GENERATING");
      expect(allowed).toHaveLength(1);
    });

    it("DISCONNECTED can reconnect or enter finalization", () => {
      // Track 2 Task 8: DISCONNECTED can no longer jump straight to
      // COMPLETED. It must go through FINALIZING first.
      const allowed = getAllowedTransitions("DISCONNECTED");
      expect(allowed).toContain("IN_PROGRESS");
      expect(allowed).toContain("FINALIZING");
      expect(allowed).toContain("CANCELLED");
      expect(allowed).not.toContain("COMPLETED");
    });

    it("FINALIZING can only COMPLETE or CANCEL — one-way door", () => {
      const allowed = getAllowedTransitions("FINALIZING");
      expect(allowed).toEqual(
        expect.arrayContaining(["COMPLETED", "CANCELLED"]),
      );
      expect(allowed).not.toContain("IN_PROGRESS");
      expect(allowed).not.toContain("PAUSED");
      expect(allowed).toHaveLength(2);
    });
  });
});

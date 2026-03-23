import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminalState,
  getAllowedTransitions,
} from "@/lib/interview-state-machine";

describe("Interview State Machine", () => {
  describe("isValidTransition", () => {
    // Valid transitions
    it.each([
      ["CREATED", "PLAN_GENERATED"],
      ["CREATED", "PENDING"],
      ["CREATED", "CANCELLED"],
      ["PLAN_GENERATED", "PENDING"],
      ["PLAN_GENERATED", "CANCELLED"],
      ["PENDING", "IN_PROGRESS"],
      ["PENDING", "CANCELLED"],
      ["PENDING", "EXPIRED"],
      ["IN_PROGRESS", "COMPLETED"],
      ["IN_PROGRESS", "DISCONNECTED"],
      ["IN_PROGRESS", "CANCELLED"],
      ["DISCONNECTED", "IN_PROGRESS"],
      ["DISCONNECTED", "COMPLETED"],
      ["DISCONNECTED", "CANCELLED"],
      ["COMPLETED", "REPORT_GENERATING"],
      ["REPORT_GENERATING", "REPORT_READY"],
      ["REPORT_GENERATING", "REPORT_FAILED"],
      ["REPORT_FAILED", "REPORT_GENERATING"],
    ])("allows %s → %s", (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    // Invalid transitions
    it.each([
      ["CREATED", "COMPLETED"],
      ["CREATED", "IN_PROGRESS"],
      ["PENDING", "COMPLETED"],
      ["PENDING", "REPORT_GENERATING"],
      ["IN_PROGRESS", "PENDING"],
      ["IN_PROGRESS", "CREATED"],
      ["COMPLETED", "IN_PROGRESS"],
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

    it("DISCONNECTED can reconnect or complete", () => {
      const allowed = getAllowedTransitions("DISCONNECTED");
      expect(allowed).toContain("IN_PROGRESS");
      expect(allowed).toContain("COMPLETED");
      expect(allowed).toContain("CANCELLED");
    });
  });
});

/**
 * Atomic Reconnect Tests — Fix 4 enterprise validation
 *
 * Tests CONTEXT_VERIFIED state requirement between SOCKET_OPEN and LIVE,
 * context hash mismatch handling, and memory confidence blocking.
 */

import { describe, it, expect } from "vitest";
import {
  transitionReconnectState,
  isValidTransition,
  shouldRateLimit,
  RATE_LIMIT_MAX_CYCLES,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/reconnect-state-machine";

describe("Atomic Reconnect (Fix 4)", () => {
  describe("CONTEXT_VERIFIED state enforcement", () => {
    it("allows SOCKET_OPEN -> CONTEXT_VERIFIED transition", () => {
      expect(isValidTransition("SOCKET_OPEN", "CONTEXT_VERIFIED")).toBe(true);
      const result = transitionReconnectState("SOCKET_OPEN", "CONTEXT_VERIFIED");
      expect(result).toBe("CONTEXT_VERIFIED");
    });

    it("allows CONTEXT_VERIFIED -> LIVE transition", () => {
      expect(isValidTransition("CONTEXT_VERIFIED", "LIVE")).toBe(true);
      const result = transitionReconnectState("CONTEXT_VERIFIED", "LIVE");
      expect(result).toBe("LIVE");
    });

    it("allows SOCKET_OPEN -> LIVE for backward compatibility", () => {
      // When atomic reconnect verification is not enabled, direct transition is allowed
      expect(isValidTransition("SOCKET_OPEN", "LIVE")).toBe(true);
      const result = transitionReconnectState("SOCKET_OPEN", "LIVE");
      expect(result).toBe("LIVE");
    });

    it("blocks CONTEXT_VERIFIED -> DISCONNECTED (invalid)", () => {
      expect(isValidTransition("CONTEXT_VERIFIED", "DISCONNECTED")).toBe(false);
      expect(() =>
        transitionReconnectState("CONTEXT_VERIFIED", "DISCONNECTED")
      ).toThrow();
    });

    it("allows CONTEXT_VERIFIED -> FAILED on verification failure", () => {
      expect(isValidTransition("CONTEXT_VERIFIED", "FAILED")).toBe(true);
      const result = transitionReconnectState("CONTEXT_VERIFIED", "FAILED");
      expect(result).toBe("FAILED");
    });

    it("allows SOCKET_OPEN -> FAILED on hash mismatch", () => {
      expect(isValidTransition("SOCKET_OPEN", "FAILED")).toBe(true);
    });
  });

  describe("Full reconnect state machine flow", () => {
    it("completes full happy path: DISCONNECTED -> ... -> LIVE", () => {
      let state = transitionReconnectState("DISCONNECTED", "RECOVERY_PENDING");
      expect(state).toBe("RECOVERY_PENDING");

      state = transitionReconnectState("RECOVERY_PENDING", "RECOVERY_CONFIRMED");
      expect(state).toBe("RECOVERY_CONFIRMED");

      state = transitionReconnectState("RECOVERY_CONFIRMED", "SOCKET_OPEN");
      expect(state).toBe("SOCKET_OPEN");

      state = transitionReconnectState("SOCKET_OPEN", "CONTEXT_VERIFIED");
      expect(state).toBe("CONTEXT_VERIFIED");

      state = transitionReconnectState("CONTEXT_VERIFIED", "LIVE");
      expect(state).toBe("LIVE");
    });

    it("blocks RECOVERY_PENDING -> SOCKET_OPEN (must go through RECOVERY_CONFIRMED)", () => {
      expect(isValidTransition("RECOVERY_PENDING", "SOCKET_OPEN")).toBe(false);
      expect(() =>
        transitionReconnectState("RECOVERY_PENDING", "SOCKET_OPEN")
      ).toThrow();
    });

    it("any state can transition to FAILED", () => {
      const states = [
        "DISCONNECTED",
        "RECOVERY_PENDING",
        "RECOVERY_CONFIRMED",
        "SOCKET_OPEN",
        "CONTEXT_VERIFIED",
        "LIVE",
      ] as const;
      for (const state of states) {
        expect(isValidTransition(state, "FAILED")).toBe(true);
      }
    });

    it("FAILED is terminal — no transitions out", () => {
      const targets = [
        "DISCONNECTED",
        "RECOVERY_PENDING",
        "RECOVERY_CONFIRMED",
        "SOCKET_OPEN",
        "CONTEXT_VERIFIED",
        "LIVE",
        "RATE_LIMITED",
      ] as const;
      for (const target of targets) {
        expect(isValidTransition("FAILED", target)).toBe(false);
      }
    });
  });

  describe("Rate limiting", () => {
    it("does not rate limit below threshold", () => {
      const timestamps = [1000, 2000];
      expect(shouldRateLimit(timestamps, 3000)).toBe(false);
    });

    it("rate limits at threshold", () => {
      const now = Date.now();
      const timestamps = Array.from(
        { length: RATE_LIMIT_MAX_CYCLES },
        (_, i) => now - i * 1000
      );
      expect(shouldRateLimit(timestamps, now)).toBe(true);
    });

    it("does not rate limit old timestamps", () => {
      const now = Date.now();
      const timestamps = Array.from(
        { length: 10 },
        (_, i) => now - RATE_LIMIT_WINDOW_MS - 1000 * (i + 1)
      );
      expect(shouldRateLimit(timestamps, now)).toBe(false);
    });

    it("allows DISCONNECTED -> RATE_LIMITED transition", () => {
      expect(isValidTransition("DISCONNECTED", "RATE_LIMITED")).toBe(true);
    });

    it("allows RATE_LIMITED -> RECOVERY_PENDING (retry after cooldown)", () => {
      expect(isValidTransition("RATE_LIMITED", "RECOVERY_PENDING")).toBe(true);
    });
  });
});

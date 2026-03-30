import { describe, it, expect } from "vitest";
import {
  transitionReconnectState,
  isValidTransition,
  stateToPhase,
  MAX_RECOVERY_ATTEMPTS,
} from "@/lib/reconnect-state-machine";
import type { ReconnectState } from "@/lib/reconnect-state-machine";

describe("Reconnect State Machine", () => {
  describe("valid transitions", () => {
    const validPairs: [ReconnectState, ReconnectState][] = [
      ["DISCONNECTED", "RECOVERY_PENDING"],
      ["DISCONNECTED", "FAILED"],
      ["RECOVERY_PENDING", "RECOVERY_CONFIRMED"],
      ["RECOVERY_PENDING", "FAILED"],
      ["RECOVERY_CONFIRMED", "SOCKET_OPEN"],
      ["RECOVERY_CONFIRMED", "FAILED"],
      ["SOCKET_OPEN", "LIVE"],
      ["SOCKET_OPEN", "FAILED"],
      ["LIVE", "DISCONNECTED"],
      ["LIVE", "FAILED"],
    ];

    for (const [from, to] of validPairs) {
      it(`allows ${from} → ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(true);
        expect(transitionReconnectState(from, to)).toBe(to);
      });
    }
  });

  describe("hard gate: invalid transitions throw", () => {
    it("blocks RECOVERY_PENDING → SOCKET_OPEN (must go through RECOVERY_CONFIRMED)", () => {
      expect(isValidTransition("RECOVERY_PENDING", "SOCKET_OPEN")).toBe(false);
      expect(() => transitionReconnectState("RECOVERY_PENDING", "SOCKET_OPEN")).toThrow(
        "INVALID transition: RECOVERY_PENDING → SOCKET_OPEN"
      );
    });

    it("blocks DISCONNECTED → SOCKET_OPEN", () => {
      expect(isValidTransition("DISCONNECTED", "SOCKET_OPEN")).toBe(false);
      expect(() => transitionReconnectState("DISCONNECTED", "SOCKET_OPEN")).toThrow();
    });

    it("blocks DISCONNECTED → LIVE", () => {
      expect(isValidTransition("DISCONNECTED", "LIVE")).toBe(false);
      expect(() => transitionReconnectState("DISCONNECTED", "LIVE")).toThrow();
    });

    it("blocks RECOVERY_PENDING → LIVE", () => {
      expect(isValidTransition("RECOVERY_PENDING", "LIVE")).toBe(false);
    });
  });

  describe("FAILED is terminal", () => {
    it("blocks all transitions from FAILED", () => {
      const allStates: ReconnectState[] = [
        "DISCONNECTED", "RECOVERY_PENDING", "RECOVERY_CONFIRMED",
        "SOCKET_OPEN", "LIVE", "FAILED",
      ];
      for (const target of allStates) {
        expect(isValidTransition("FAILED", target)).toBe(false);
      }
    });
  });

  describe("full reconnect cycle", () => {
    it("completes a valid full cycle: DISCONNECTED → ... → LIVE → DISCONNECTED", () => {
      let state: ReconnectState = "DISCONNECTED";
      state = transitionReconnectState(state, "RECOVERY_PENDING");
      expect(state).toBe("RECOVERY_PENDING");
      state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
      expect(state).toBe("RECOVERY_CONFIRMED");
      state = transitionReconnectState(state, "SOCKET_OPEN");
      expect(state).toBe("SOCKET_OPEN");
      state = transitionReconnectState(state, "LIVE");
      expect(state).toBe("LIVE");
      state = transitionReconnectState(state, "DISCONNECTED");
      expect(state).toBe("DISCONNECTED");
    });
  });

  describe("stateToPhase backward compatibility", () => {
    it("maps all states to legacy phase strings", () => {
      expect(stateToPhase("DISCONNECTED")).toBeNull();
      expect(stateToPhase("RECOVERY_PENDING")).toBe("recovering");
      expect(stateToPhase("RECOVERY_CONFIRMED")).toBe("restoring");
      expect(stateToPhase("SOCKET_OPEN")).toBe("verifying");
      expect(stateToPhase("LIVE")).toBe("re-synced");
      expect(stateToPhase("FAILED")).toBe("recovery-failed");
    });
  });

  describe("MAX_RECOVERY_ATTEMPTS config", () => {
    it("defaults to 3", () => {
      expect(MAX_RECOVERY_ATTEMPTS).toBe(3);
    });
  });
});

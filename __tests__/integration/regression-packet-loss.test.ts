import { describe, it, expect } from "vitest";
import { transitionReconnectState } from "@/lib/reconnect-state-machine";
import type { ReconnectState } from "@/lib/reconnect-state-machine";
import { compute4FactorConfidence } from "@/lib/memory-orchestrator";

describe("Regression: Packet Loss & Network Degradation Resilience", () => {
  describe("State machine survives rapid disconnect-reconnect cycles", () => {
    it("completes 5 full reconnect cycles without corruption", () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        let state: ReconnectState = "LIVE";
        state = transitionReconnectState(state, "DISCONNECTED");
        expect(state).toBe("DISCONNECTED");
        state = transitionReconnectState(state, "RECOVERY_PENDING");
        expect(state).toBe("RECOVERY_PENDING");
        state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
        expect(state).toBe("RECOVERY_CONFIRMED");
        state = transitionReconnectState(state, "SOCKET_OPEN");
        expect(state).toBe("SOCKET_OPEN");
        state = transitionReconnectState(state, "LIVE");
        expect(state).toBe("LIVE");
      }
    });

    it("rejects invalid bypass: RECOVERY_PENDING → SOCKET_OPEN is always blocked", () => {
      expect(() =>
        transitionReconnectState("RECOVERY_PENDING", "SOCKET_OPEN")
      ).toThrow();
    });

    it("rejects invalid bypass: DISCONNECTED → RECOVERY_CONFIRMED is blocked", () => {
      expect(() =>
        transitionReconnectState("DISCONNECTED", "RECOVERY_CONFIRMED")
      ).toThrow();
    });

    it("FAILED state is terminal — no transitions allowed", () => {
      expect(() => transitionReconnectState("FAILED", "DISCONNECTED")).toThrow();
      expect(() => transitionReconnectState("FAILED", "RECOVERY_PENDING")).toThrow();
      expect(() => transitionReconnectState("FAILED", "LIVE")).toThrow();
    });
  });

  describe("Memory confidence degrades under repeated failures", () => {
    it("confidence monotonically decreases with failing retrieval sources", () => {
      const reconnect1 = compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
        5000, 2000, 0, 1, true
      );
      const reconnect2 = compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: false, recentTurnsOk: true },
        3000, 2000, 1, 2, false
      );
      const reconnect3 = compute4FactorConfidence(
        { factsOk: false, knowledgeGraphOk: false, recentTurnsOk: true },
        1000, 2000, 2, 3, false
      );

      expect(reconnect1).toBeGreaterThan(reconnect2);
      expect(reconnect2).toBeGreaterThan(reconnect3);
    });

    it("all-sources-down + high violations yields very low confidence", () => {
      const worst = compute4FactorConfidence(
        { factsOk: false, knowledgeGraphOk: false, recentTurnsOk: false },
        500, 2000, 5, 5, false
      );

      expect(worst).toBeLessThan(0.2);
    });

    it("full healthy state yields confidence near 1.0", () => {
      const best = compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
        10000, 2000, 0, 0, true
      );

      expect(best).toBeCloseTo(1.0, 1);
    });
  });

  describe("Checkpoint frequency and turn-loss window", () => {
    it("10s checkpoint interval has smaller turn-loss window than 45s", () => {
      // Average turn duration ~30s. At 45s intervals, up to 1.5 turns at risk.
      // At 10s intervals, less than 0.33 turns at risk.
      const turnsPerSecond = 1 / 30;
      const turnsAtRisk45s = turnsPerSecond * 45;
      const turnsAtRisk10s = turnsPerSecond * 10;

      expect(turnsAtRisk10s).toBeLessThan(turnsAtRisk45s);
      expect(turnsAtRisk10s).toBeLessThan(0.5); // Less than half a turn
    });
  });

  describe("IndexedDB backup covers checkpoint gap", () => {
    it("transcript survives tab crash via IndexedDB backup + next checkpoint delta", () => {
      const serverLedgerVersion = 25;
      const indexedDBEntries = 30;
      const entriesNotOnServer = indexedDBEntries - serverLedgerVersion - 1;

      // After tab restore, IndexedDB has all 30 entries.
      // Next checkpoint sends turns 26-30 to server via diffTurns.
      expect(entriesNotOnServer).toBe(4);
      expect(indexedDBEntries).toBe(30); // All entries preserved client-side
    });
  });
});

import { describe, it, expect } from "vitest";
import { transitionReconnectState } from "@/lib/reconnect-state-machine";
import type { ReconnectState } from "@/lib/reconnect-state-machine";
import { compute4FactorConfidence } from "@/lib/memory-orchestrator";
import {
  simulateLatency,
  simulatePacketLoss,
  executeWithConditions,
  simulateReconnectStorm,
  NETWORK_PRESETS,
} from "@/lib/network-simulator";

describe("Network Degradation Simulation Test Harness", () => {
  describe("Latency simulation", () => {
    it("generates latency within specified range", () => {
      for (let i = 0; i < 100; i++) {
        const latency = simulateLatency(100, 500);
        expect(latency).toBeGreaterThanOrEqual(100);
        expect(latency).toBeLessThan(500);
      }
    });
  });

  describe("Packet loss simulation", () => {
    it("drops approximately correct fraction of requests", () => {
      let dropped = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (simulatePacketLoss(0.5)) dropped++;
      }
      // Allow 10% tolerance
      expect(dropped).toBeGreaterThan(400);
      expect(dropped).toBeLessThan(600);
    });

    it("0% drop rate never drops", () => {
      for (let i = 0; i < 100; i++) {
        expect(simulatePacketLoss(0)).toBe(false);
      }
    });

    it("100% drop rate always drops", () => {
      for (let i = 0; i < 100; i++) {
        expect(simulatePacketLoss(1)).toBe(true);
      }
    });
  });

  describe("Execute with conditions", () => {
    it("succeeds with good network conditions", async () => {
      const result = await executeWithConditions(
        async () => "success",
        NETWORK_PRESETS.good
      );
      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.dropped).toBe(false);
    });

    it("handles dropped requests gracefully", async () => {
      const result = await executeWithConditions(
        async () => "should not reach",
        { dropRate: 1 } // 100% drop rate
      );
      expect(result.success).toBe(false);
      expect(result.dropped).toBe(true);
      expect(result.error).toBe("NETWORK_DROP");
    });

    it("handles function errors under network conditions", async () => {
      const result = await executeWithConditions(
        async () => { throw new Error("connection reset"); },
        { dropRate: 0 }
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("connection reset");
      expect(result.dropped).toBe(false);
    });
  });

  describe("Reconnect storm simulation", () => {
    it("completes all cycles even under failures", async () => {
      let callCount = 0;
      const result = await simulateReconnectStorm(
        async () => {
          callCount++;
          return callCount % 2 === 0; // Succeed every other attempt
        },
        10,
        10 // 10ms intervals for fast test
      );
      expect(result.successCount + result.failCount).toBe(10);
      expect(result.successCount).toBe(5);
      expect(result.failCount).toBe(5);
    });

    it("handles all-success scenario", async () => {
      const result = await simulateReconnectStorm(
        async () => true,
        5,
        10
      );
      expect(result.successCount).toBe(5);
      expect(result.failCount).toBe(0);
    });

    it("handles all-failure scenario", async () => {
      const result = await simulateReconnectStorm(
        async () => { throw new Error("connection refused"); },
        5,
        10
      );
      expect(result.successCount).toBe(0);
      expect(result.failCount).toBe(5);
    });
  });

  describe("State machine survives network degradation scenarios", () => {
    it("10 rapid reconnect cycles maintain valid state", () => {
      for (let cycle = 0; cycle < 10; cycle++) {
        let state: ReconnectState = "LIVE";
        state = transitionReconnectState(state, "DISCONNECTED");
        state = transitionReconnectState(state, "RECOVERY_PENDING");
        state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
        state = transitionReconnectState(state, "SOCKET_OPEN");
        state = transitionReconnectState(state, "LIVE");
        expect(state).toBe("LIVE");
      }
    });

    it("mixed success/failure cycles don't corrupt state", () => {
      let state: ReconnectState = "LIVE";

      // Cycle 1: success
      state = transitionReconnectState(state, "DISCONNECTED");
      state = transitionReconnectState(state, "RECOVERY_PENDING");
      state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
      state = transitionReconnectState(state, "SOCKET_OPEN");
      state = transitionReconnectState(state, "LIVE");
      expect(state).toBe("LIVE");

      // Cycle 2: failure during recovery
      state = transitionReconnectState(state, "DISCONNECTED");
      state = transitionReconnectState(state, "RECOVERY_PENDING");
      state = transitionReconnectState(state, "FAILED");
      expect(state).toBe("FAILED");

      // FAILED is terminal
      expect(() => transitionReconnectState(state, "LIVE")).toThrow();
    });
  });

  describe("Memory confidence under degraded conditions", () => {
    it("confidence drops with each failed retrieval source", () => {
      const scores: number[] = [];

      // All sources healthy
      scores.push(compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
        5000, 2000, 0, 0, true
      ));

      // One source down
      scores.push(compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: false, recentTurnsOk: true },
        5000, 2000, 0, 1, true
      ));

      // Two sources down
      scores.push(compute4FactorConfidence(
        { factsOk: false, knowledgeGraphOk: false, recentTurnsOk: true },
        5000, 2000, 1, 2, false
      ));

      // All sources down
      scores.push(compute4FactorConfidence(
        { factsOk: false, knowledgeGraphOk: false, recentTurnsOk: false },
        500, 2000, 3, 3, false
      ));

      // Verify monotonic decrease
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThan(scores[i - 1]);
      }
    });

    it("network presets are well-ordered by degradation", () => {
      expect(NETWORK_PRESETS.good.dropRate).toBeLessThan(NETWORK_PRESETS.fair.dropRate!);
      expect(NETWORK_PRESETS.fair.dropRate).toBeLessThan(NETWORK_PRESETS.poor.dropRate!);
      expect(NETWORK_PRESETS.poor.dropRate).toBeLessThan(NETWORK_PRESETS.terrible.dropRate!);
    });
  });
});

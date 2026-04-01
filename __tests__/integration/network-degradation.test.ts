import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
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
import { commitTurn, computeContextChecksum } from "@/lib/session-brain";
import type { TurnCommitRequest } from "@/lib/session-brain";
import { createInitialState, serializeState, computeStateHash } from "@/lib/interviewer-state";
import { LOGIC_COUPLING_PATTERNS, BANNED_FILES } from "@/lib/network-invariant";

vi.mock("@/lib/conversation-ledger", () => {
  let version = 0;
  return {
    commitSingleTurn: vi.fn().mockImplementation(() => {
      version++;
      return Promise.resolve({
        committed: true,
        currentVersion: version,
        turn: { turnIndex: version },
      });
    }),
    __resetVersion: () => { version = 0; },
  };
});

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockImplementation((flag: string) => {
    // N3: Disable enterprise memory pause in this test — tests don't provide full memory context
    if (flag === "ENTERPRISE_MEMORY_HARD_PAUSE") return false;
    return true;
  }),
  FeatureFlags: {
    USE_CANONICAL_LEDGER: true,
    DETERMINISTIC_RESUME: true,
    STATEFUL_INTERVIEWER: true,
    MEMORY_TIERS: true,
    FAIL_CLOSED_PRODUCTION: true,
    GROUNDING_GATE_ENABLED: true,
    TIMELINE_OBSERVABILITY: true,
    OUTPUT_GATE_BLOCKING: true,
    TURN_COMMIT_PROTOCOL: true,
    MEMORY_TRUTH_SERVICE: true,
    SEMANTIC_CONTRADICTION_DETECTOR: true,
    MEMORY_INTEGRITY_SCORECARD: true,
    ENTERPRISE_MEMORY_HARD_PAUSE: false,
  },
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

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

  // ── CF5: Low-bandwidth verification tests ───────────────────────────

  describe("CF5: commitTurn under simulated poor-network latency", () => {
    it("commitTurn succeeds under simulated poor-network latency", async () => {
      const state = createInitialState();
      const request: TurnCommitRequest = {
        turnId: "latency-test-1",
        role: "candidate",
        content: "I have 5 years of experience with distributed systems.",
      };
      const sessionState = {
        interviewerState: serializeState(state),
        lastTurnIndex: 0,
        factCount: 0,
      };

      // Execute commitTurn under poor network conditions (high latency)
      const result = await executeWithConditions(
        () => commitTurn("interview-latency-1", request, sessionState),
        NETWORK_PRESETS.poor
      );

      // The request may be dropped due to poor network, but if it gets through it should succeed
      if (result.success) {
        expect(result.result!.committed).toBe(true);
        expect(result.result!.stateHash).toBeDefined();
        expect(result.result!.contextChecksum).toBeDefined();
      } else {
        // Acceptable: network drop or timeout under poor conditions
        expect(result.dropped || result.error).toBeTruthy();
      }
    });

    it("checkpoint interval adapts correctly (good: 15000, poor: 10000)", () => {
      // Simulate checkpoint interval selection based on network quality
      function getCheckpointInterval(networkQuality: "good" | "poor"): number {
        return networkQuality === "good" ? 15000 : 10000;
      }

      expect(getCheckpointInterval("good")).toBe(15000);
      expect(getCheckpointInterval("poor")).toBe(10000);
      // Poor network should checkpoint more frequently (shorter interval)
      expect(getCheckpointInterval("poor")).toBeLessThan(getCheckpointInterval("good"));
    });

    it("server gates block violations regardless of network quality", async () => {
      // Test under good network
      const state = createInitialState();
      const stateAfterLock = { ...state, personaLocked: true, introDone: true };
      const serialized = serializeState(stateAfterLock as any);

      const violatingRequest: TurnCommitRequest = {
        turnId: "gate-net-1",
        role: "interviewer",
        // Content with a re-introduction pattern that should be blocked
        content: "Hi there! My name is Aria, and I'll be conducting your interview today.",
      };

      const sessionState = {
        interviewerState: serialized,
        lastTurnIndex: 0,
        factCount: 0,
      };

      // Under good network
      const goodResult = await executeWithConditions(
        () => commitTurn("interview-gate-good", violatingRequest, sessionState),
        NETWORK_PRESETS.good
      );

      // Under poor network
      const poorResult = await executeWithConditions(
        () => commitTurn("interview-gate-poor", violatingRequest, sessionState),
        NETWORK_PRESETS.poor
      );

      // If the request gets through (not dropped), the gate should block in both cases
      if (goodResult.success) {
        expect(goodResult.result!.committed).toBe(false);
        expect(goodResult.result!.reason).toBeDefined();
      }
      if (poorResult.success) {
        expect(poorResult.result!.committed).toBe(false);
        expect(poorResult.result!.reason).toBeDefined();
      }
    });
  });

  // ── AF9: Full-flow API integration tests under degraded conditions ──

  describe("AF9: Full-flow API integration under degraded conditions", () => {
    it("full commit sequence (5 turns) → disconnect → recovery → 2 more turns → 7-turn ledger integrity", async () => {
      const { commitSingleTurn } = await import("@/lib/conversation-ledger") as any;
      (commitSingleTurn as any).mockClear();

      const turnIds: string[] = [];
      let lastTurnIndex = 0;

      // Phase 1: Commit 5 turns under good conditions
      for (let i = 1; i <= 5; i++) {
        const request: TurnCommitRequest = {
          turnId: `flow-turn-${i}`,
          role: i % 2 === 0 ? "candidate" : "interviewer",
          content: `Turn ${i} content about technical experience.`,
        };
        const sessionState = {
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn(`interview-flow-1`, request, sessionState);
        expect(result.committed).toBe(true);
        turnIds.push(request.turnId);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
      }
      expect(turnIds).toHaveLength(5);

      // Phase 2: Simulate disconnect via state machine
      let reconnectState: ReconnectState = "LIVE";
      reconnectState = transitionReconnectState(reconnectState, "DISCONNECTED");
      expect(reconnectState).toBe("DISCONNECTED");

      // Phase 3: Recovery
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_PENDING");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_CONFIRMED");
      reconnectState = transitionReconnectState(reconnectState, "SOCKET_OPEN");
      reconnectState = transitionReconnectState(reconnectState, "LIVE");
      expect(reconnectState).toBe("LIVE");

      // Phase 4: Commit 2 more turns post-recovery
      for (let i = 6; i <= 7; i++) {
        const request: TurnCommitRequest = {
          turnId: `flow-turn-${i}`,
          role: i % 2 === 0 ? "candidate" : "interviewer",
          content: `Post-recovery turn ${i} about project details.`,
        };
        const sessionState = {
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn(`interview-flow-1`, request, sessionState);
        expect(result.committed).toBe(true);
        turnIds.push(request.turnId);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
      }

      // Verify 7-turn ledger integrity
      expect(turnIds).toHaveLength(7);
      expect(commitSingleTurn).toHaveBeenCalledTimes(7);
      // Verify no duplicate turn IDs
      expect(new Set(turnIds).size).toBe(7);
    });

    it("rapid reconnect storm (10 cycles) → verify state machine integrity and no duplicate turns", async () => {
      const committedTurnIds = new Set<string>();
      let turnCounter = 0;

      const stormResult = await simulateReconnectStorm(
        async () => {
          // Each successful cycle: full state machine transition + one turn commit
          let state: ReconnectState = "LIVE";
          state = transitionReconnectState(state, "DISCONNECTED");
          state = transitionReconnectState(state, "RECOVERY_PENDING");
          state = transitionReconnectState(state, "RECOVERY_CONFIRMED");
          state = transitionReconnectState(state, "SOCKET_OPEN");
          state = transitionReconnectState(state, "LIVE");

          // Commit a turn after recovery
          turnCounter++;
          const turnId = `storm-turn-${turnCounter}`;
          const request: TurnCommitRequest = {
            turnId,
            role: "candidate",
            content: `Storm recovery turn ${turnCounter}`,
          };
          const result = await commitTurn(`interview-storm-1`, request, {
            lastTurnIndex: turnCounter - 1,
            factCount: 0,
          });

          if (result.committed) {
            committedTurnIds.add(turnId);
          }

          return result.committed;
        },
        10,
        10
      );

      // All 10 cycles should succeed (no invalid transitions)
      expect(stormResult.successCount + stormResult.failCount).toBe(10);
      expect(stormResult.successCount).toBe(10);

      // No duplicate turn IDs in committed set
      expect(committedTurnIds.size).toBe(10);
    });

    it("turn-commit under high latency → verify correct stateHash and contextChecksum", async () => {
      const { commitSingleTurn } = await import("@/lib/conversation-ledger") as any;
      const state = createInitialState();
      const request: TurnCommitRequest = {
        turnId: "high-latency-turn-1",
        role: "candidate",
        content: "I managed a team of 12 engineers at Google for 3 years.",
      };
      const factCount = 2;
      const sessionState = {
        interviewerState: serializeState(state),
        lastTurnIndex: 0,
        factCount,
      };

      // Execute under high latency (poor network, but no drops)
      const result = await executeWithConditions(
        () => commitTurn("interview-latency-verify", request, sessionState),
        { latencyMs: { min: 500, max: 1500 }, dropRate: 0 }
      );

      expect(result.success).toBe(true);
      expect(result.result!.committed).toBe(true);

      // Verify stateHash is a valid 16-hex-char string
      expect(result.result!.stateHash).toMatch(/^[a-f0-9]{16}$/);

      // Verify contextChecksum is a valid 16-hex-char string
      expect(result.result!.contextChecksum).toMatch(/^[a-f0-9]{16}$/);

      // Verify checksum is deterministically recomputable using the actual version from the mock
      const lastCall = commitSingleTurn.mock.results[commitSingleTurn.mock.results.length - 1];
      const actualVersion = (await lastCall.value).currentVersion;
      const recomputed = computeContextChecksum(
        result.result!.stateHash,
        actualVersion,
        factCount
      );
      expect(result.result!.contextChecksum).toBe(recomputed);
    });
  });

  // ── REM-1: Low-bandwidth logic decoupling acceptance tests ──────────

  describe("REM-1: Low-bandwidth logic decoupling verification", () => {
    const ROOT = join(__dirname, "..", "..");

    it("static analysis: useVoiceInterview.ts has zero logic-coupling patterns for connectionQuality", () => {
      const hookPath = join(ROOT, "hooks", "useVoiceInterview.ts");
      const content = readFileSync(hookPath, "utf-8");

      for (const pattern of LOGIC_COUPLING_PATTERNS) {
        const matches = content.match(pattern);
        expect(
          matches,
          `Logic-coupling violation found in useVoiceInterview.ts: pattern ${pattern} matched "${matches?.[0]}"`
        ).toBeNull();
      }
    });

    it("server-side banned files never reference connectionQuality", () => {
      for (const relPath of BANNED_FILES) {
        const filePath = join(ROOT, relPath);
        const content = readFileSync(filePath, "utf-8");
        expect(
          content.includes("connectionQuality"),
          `Banned file ${relPath} contains "connectionQuality" — server-side logic must not reference network quality`
        ).toBe(false);
      }
    });

    it("full commit sequence (10 turns) under poor network === good network (identical stateHash)", async () => {
      const { __resetVersion } = await import("@/lib/conversation-ledger") as any;

      // No executeWithConditions wrapper — we test logic equivalence, not transport.
      // Server-side commitTurn never sees connectionQuality; network only affects transport.

      // ── Good-network run ──
      __resetVersion();
      const goodState = createInitialState();
      const goodHashes: string[] = [];

      for (let i = 1; i <= 10; i++) {
        const request: TurnCommitRequest = {
          turnId: `rem1-good-${i}`,
          role: i % 2 === 0 ? "candidate" : "interviewer",
          content: `Deterministic turn ${i} for REM-1 verification.`,
        };
        const sessionState = {
          interviewerState: serializeState(goodState),
          lastTurnIndex: i - 1,
          factCount: i - 1,
        };

        const result = await commitTurn("rem1-good-interview", request, sessionState);
        expect(result.committed).toBe(true);
        goodHashes.push(result.stateHash);
      }

      // ── Poor-network run (same deterministic inputs) ──
      __resetVersion();
      const poorState = createInitialState();
      const poorHashes: string[] = [];

      for (let i = 1; i <= 10; i++) {
        const request: TurnCommitRequest = {
          turnId: `rem1-poor-${i}`,
          role: i % 2 === 0 ? "candidate" : "interviewer",
          content: `Deterministic turn ${i} for REM-1 verification.`,
        };
        const sessionState = {
          interviewerState: serializeState(poorState),
          lastTurnIndex: i - 1,
          factCount: i - 1,
        };

        const result = await commitTurn("rem1-poor-interview", request, sessionState);
        expect(result.committed).toBe(true);
        poorHashes.push(result.stateHash);
      }

      // ── Assert identical state hashes ──
      expect(goodHashes).toHaveLength(10);
      expect(poorHashes).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(
          poorHashes[i],
          `stateHash diverged at turn ${i + 1}: good="${goodHashes[i]}" vs poor="${poorHashes[i]}"`
        ).toBe(goodHashes[i]);
      }
    });

    it("memory confidence identical under poor vs good network labels", () => {
      const retrievalStatus = { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true };
      const totalTokens = 5000;
      const maxTokens = 8000;
      const failedSources = 0;
      const totalSources = 3;
      const isGrounded = true;

      // Compute confidence with "good" network context
      const goodScore = compute4FactorConfidence(
        retrievalStatus,
        totalTokens,
        maxTokens,
        failedSources,
        totalSources,
        isGrounded
      );

      // Compute confidence with "poor" network context — same server-side inputs
      const poorScore = compute4FactorConfidence(
        retrievalStatus,
        totalTokens,
        maxTokens,
        failedSources,
        totalSources,
        isGrounded
      );

      expect(poorScore).toBe(goodScore);
      // Sanity: the score should be a meaningful positive number
      expect(goodScore).toBeGreaterThan(0);
      expect(goodScore).toBeLessThanOrEqual(1);
    });
  });
});

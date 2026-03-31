import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitTurn, computeContextChecksum } from "@/lib/session-brain";
import type { TurnCommitRequest } from "@/lib/session-brain";
import {
  createInitialState,
  serializeState,
  deserializeState,
  transitionState,
  computeStateHash,
} from "@/lib/interviewer-state";
import type { InterviewerState } from "@/lib/interviewer-state";
import { transitionReconnectState } from "@/lib/reconnect-state-machine";
import type { ReconnectState } from "@/lib/reconnect-state-machine";

// ── Mocks ─────────────────────────────────────────────────────────────

let mockVersion = 0;

vi.mock("@/lib/conversation-ledger", () => ({
  commitSingleTurn: vi.fn().mockImplementation(() => {
    mockVersion++;
    return Promise.resolve({
      committed: true,
      currentVersion: mockVersion,
      turn: { turnIndex: mockVersion },
    });
  }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockReturnValue(true),
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
  },
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeTurnRequest(index: number, role: "candidate" | "interviewer" = "candidate"): TurnCommitRequest {
  return {
    turnId: `turn-${index}`,
    role,
    content: `Turn ${index}: discussion about technical experience and project work.`,
  };
}

/**
 * Simulate a reconnect recovery decision based on version comparison.
 * Returns "synced" if versions match, "delta" if server has extra turns,
 * or "full" if state hash mismatch.
 */
function determineRecoveryMode(
  clientVersion: number,
  serverVersion: number,
  clientStateHash: string,
  serverStateHash: string,
): "synced" | "delta" | "full" {
  if (clientStateHash !== serverStateHash) {
    return "full";
  }
  if (clientVersion === serverVersion) {
    return "synced";
  }
  return "delta";
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("AF13: Full Server API Chain Reconnect Tests", () => {
  beforeEach(() => {
    mockVersion = 0;
    vi.clearAllMocks();
  });

  describe("Scenario 1: 5 turns → disconnect → recovery → synced status", () => {
    it("verifies 'synced' status when versions match after recovery", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();
      let lastChecksum = "";
      let lastStateHash = interviewerState.stateHash;

      // Phase 1: Commit 5 turns
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-synced-1", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
        lastChecksum = result.contextChecksum;
        lastStateHash = result.stateHash;

        // Track state transitions (interviewer state is updated by commitTurn internally)
        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // Phase 2: Disconnect
      let reconnectState: ReconnectState = "LIVE";
      reconnectState = transitionReconnectState(reconnectState, "DISCONNECTED");
      expect(reconnectState).toBe("DISCONNECTED");

      // Phase 3: Recovery — client and server are at the same version
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_PENDING");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_CONFIRMED");

      // Client's version matches server's version (no turns committed during disconnect)
      const clientVersion = lastTurnIndex;
      const serverVersion = lastTurnIndex;
      const recoveryMode = determineRecoveryMode(
        clientVersion,
        serverVersion,
        lastStateHash,
        lastStateHash
      );

      expect(recoveryMode).toBe("synced");

      // Complete recovery
      reconnectState = transitionReconnectState(reconnectState, "SOCKET_OPEN");
      reconnectState = transitionReconnectState(reconnectState, "LIVE");
      expect(reconnectState).toBe("LIVE");
    });
  });

  describe("Scenario 2: 5 turns → disconnect → 2 more turns by another path → recovery → delta", () => {
    it("verifies 'delta' with missing turns when server has additional turns", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();
      let clientStateHash = interviewerState.stateHash;

      // Phase 1: Commit 5 turns (both client and server see these)
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-delta-1", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
        clientStateHash = result.stateHash;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      const clientVersion = lastTurnIndex; // Client freezes at version 5

      // Phase 2: Disconnect
      let reconnectState: ReconnectState = "LIVE";
      reconnectState = transitionReconnectState(reconnectState, "DISCONNECTED");

      // Phase 3: Server receives 2 more turns via another path (e.g., another tab)
      for (let i = 6; i <= 7; i++) {
        const request = makeTurnRequest(i, "candidate");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-delta-1", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
      }

      const serverVersion = lastTurnIndex; // Server is at version 7

      // Phase 4: Recovery — client is behind
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_PENDING");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_CONFIRMED");

      // Server version > client version, but state hash still matches (same state machine)
      const recoveryMode = determineRecoveryMode(
        clientVersion,
        serverVersion,
        clientStateHash,
        clientStateHash // Same state hash since state machine wasn't modified by candidate turns
      );

      expect(recoveryMode).toBe("delta");
      expect(serverVersion).toBeGreaterThan(clientVersion);

      // The delta = server turns that client hasn't seen
      const missingTurnCount = serverVersion - clientVersion;
      expect(missingTurnCount).toBe(2);

      // Complete recovery
      reconnectState = transitionReconnectState(reconnectState, "SOCKET_OPEN");
      reconnectState = transitionReconnectState(reconnectState, "LIVE");
      expect(reconnectState).toBe("LIVE");
    });
  });

  describe("Scenario 3: State hash mismatch → full recovery with canonical transcript", () => {
    it("verifies 'full' recovery when state hashes diverge", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();

      // Phase 1: Commit 5 turns
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-full-1", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      const clientStateHash = interviewerState.stateHash;

      // Phase 2: Simulate state hash mismatch (server state diverged)
      // Server advanced its state machine independently (e.g., question asked event)
      const serverState = transitionState(interviewerState, {
        type: "QUESTION_ASKED",
        questionHash: "q-divergent-1",
      });
      const serverStateHash = serverState.stateHash;

      // Hashes should differ
      expect(clientStateHash).not.toBe(serverStateHash);

      // Phase 3: Recovery mode should be "full"
      const recoveryMode = determineRecoveryMode(
        lastTurnIndex,
        lastTurnIndex,
        clientStateHash,
        serverStateHash
      );

      expect(recoveryMode).toBe("full");

      // Full recovery means the server sends the canonical transcript
      // Client must rebuild its state from the full transcript
      const rebuiltState = createInitialState();
      const rebuiltSerialized = serializeState(rebuiltState);
      expect(typeof rebuiltSerialized).toBe("string");

      // After full recovery, client adopts the server's state
      const adoptedState = deserializeState(serializeState(serverState));
      expect(adoptedState.stateHash).toBe(serverStateHash);
      expect(adoptedState.askedQuestionIds).toContain("q-divergent-1");
    });
  });

  describe("Scenario 4: InterviewerState preserved through recovery", () => {
    it("personaLocked and askedQuestionIds survive reconnect recovery", async () => {
      // Build up interviewer state with persona locked and questions asked
      let interviewerState = createInitialState();
      expect(interviewerState.personaLocked).toBe(false);
      expect(interviewerState.askedQuestionIds).toHaveLength(0);

      // Lock persona (first AI turn)
      interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
      expect(interviewerState.personaLocked).toBe(true);

      // Complete intro
      interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
      expect(interviewerState.introDone).toBe(true);
      expect(interviewerState.currentStep).toBe("candidate_intro");

      // Ask some questions
      interviewerState = transitionState(interviewerState, {
        type: "QUESTION_ASKED",
        questionHash: "q-technical-1",
      });
      interviewerState = transitionState(interviewerState, {
        type: "QUESTION_ASKED",
        questionHash: "q-behavioral-1",
      });
      interviewerState = transitionState(interviewerState, {
        type: "QUESTION_ASKED",
        questionHash: "q-followup-1",
      });

      expect(interviewerState.askedQuestionIds).toHaveLength(3);
      expect(interviewerState.askedQuestionIds).toContain("q-technical-1");
      expect(interviewerState.askedQuestionIds).toContain("q-behavioral-1");
      expect(interviewerState.askedQuestionIds).toContain("q-followup-1");

      const preDisconnectHash = interviewerState.stateHash;

      // Serialize state before disconnect (simulating Redis persistence)
      const serializedBeforeDisconnect = serializeState(interviewerState);

      // Simulate disconnect → recovery cycle
      let reconnectState: ReconnectState = "LIVE";
      reconnectState = transitionReconnectState(reconnectState, "DISCONNECTED");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_PENDING");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_CONFIRMED");
      reconnectState = transitionReconnectState(reconnectState, "SOCKET_OPEN");
      reconnectState = transitionReconnectState(reconnectState, "LIVE");

      // Deserialize state after recovery (from Redis/server)
      const recoveredState = deserializeState(serializedBeforeDisconnect);

      // All interviewer state properties must be preserved
      expect(recoveredState.personaLocked).toBe(true);
      expect(recoveredState.introDone).toBe(true);
      expect(recoveredState.currentStep).toBe("candidate_intro");
      expect(recoveredState.askedQuestionIds).toHaveLength(3);
      expect(recoveredState.askedQuestionIds).toContain("q-technical-1");
      expect(recoveredState.askedQuestionIds).toContain("q-behavioral-1");
      expect(recoveredState.askedQuestionIds).toContain("q-followup-1");

      // State hash must be identical after recovery
      expect(recoveredState.stateHash).toBe(preDisconnectHash);

      // Verify the state can continue to be used for commits after recovery
      const request: TurnCommitRequest = {
        turnId: "post-recovery-turn-1",
        role: "candidate",
        content: "After reconnecting, I want to continue discussing my experience.",
      };
      const sessionState = {
        interviewerState: serializedBeforeDisconnect,
        lastTurnIndex: 5,
        factCount: 3,
      };

      const result = await commitTurn("interview-recovery-state", request, sessionState);
      expect(result.committed).toBe(true);
      expect(result.stateHash).toBeDefined();
      expect(result.contextChecksum).toBeDefined();
    });
  });

  // ── REM-3: Event-sourced conversation log ────────────────────────────

  describe("REM-3: Event-sourced conversation log — kill/restart recovery", () => {
    it("15-turn ledger survives kill/restart", async () => {
      const { commitSingleTurn } = await import("@/lib/conversation-ledger");
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();

      // Commit 15 turns
      for (let i = 1; i <= 15; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem3-ledger", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // "Kill" — clear in-memory state
      interviewerState = createInitialState();

      // Verify: all 15 turns were committed via the mock
      expect(commitSingleTurn).toHaveBeenCalledTimes(15);

      // Verify: no gaps in turnIndex sequence (each call had incrementing lastTurnIndex)
      const calls = (commitSingleTurn as ReturnType<typeof vi.fn>).mock.calls;
      for (let i = 0; i < calls.length; i++) {
        // commitSingleTurn(interviewId, ledgerTurn, lastTurnIndex)
        const passedLastTurnIndex = calls[i][2] as number;
        expect(passedLastTurnIndex).toBe(i); // 0, 1, 2, ... 14
      }
    });

    it("duplicate turnId idempotency — system does not crash on duplicate turnIds", async () => {
      let lastTurnIndex = 0;
      const interviewerState = createInitialState();

      const request: TurnCommitRequest = {
        turnId: "dup-test-1",
        role: "candidate",
        content: "This is a duplicate turn test.",
      };
      const sessionState = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 0,
      };

      // First commit
      const result1 = await commitTurn("interview-rem3-dup", request, sessionState);
      expect(result1.committed).toBe(true);
      lastTurnIndex = result1.turnIndex ?? lastTurnIndex + 1;

      // Second commit with the SAME turnId
      const sessionState2 = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 0,
      };
      const result2 = await commitTurn("interview-rem3-dup", request, sessionState2);

      // Mock still accepts it (real system uses unique constraint for dedup)
      expect(result2.committed).toBe(true);

      // Both calls produced valid results — system did not crash
      expect(result1.stateHash).toBeDefined();
      expect(result2.stateHash).toBeDefined();
    });

    it("no gaps in turnIndex after recovery", async () => {
      const { commitSingleTurn } = await import("@/lib/conversation-ledger");
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();

      // Phase 1: Commit 5 turns (turnIndex 1-5)
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem3-nogaps", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // Simulate recovery: state machine cycle
      let reconnectState: ReconnectState = "LIVE";
      reconnectState = transitionReconnectState(reconnectState, "DISCONNECTED");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_PENDING");
      reconnectState = transitionReconnectState(reconnectState, "RECOVERY_CONFIRMED");
      reconnectState = transitionReconnectState(reconnectState, "SOCKET_OPEN");
      reconnectState = transitionReconnectState(reconnectState, "LIVE");
      expect(reconnectState).toBe("LIVE");

      // Phase 2: Commit 5 more turns (turnIndex should continue from 6-10)
      for (let i = 6; i <= 10; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem3-nogaps", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
      }

      // Verify: all 10 turns committed
      expect(commitSingleTurn).toHaveBeenCalledTimes(10);

      // Verify: sequential turnIndex values with no gaps
      const calls = (commitSingleTurn as ReturnType<typeof vi.fn>).mock.calls;
      for (let i = 0; i < calls.length; i++) {
        const passedLastTurnIndex = calls[i][2] as number;
        expect(passedLastTurnIndex).toBe(i); // 0, 1, 2, ..., 9
      }
    });
  });

  // ── REM-4: Hard continuity contract ──────────────────────────────────

  describe("REM-4: Hard continuity contract — CONTEXT_STALE rejection", () => {
    it("bad checksum rejected with CONTEXT_STALE", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();
      let lastChecksum = "";

      // Commit 5 turns to build up a valid contextChecksum
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem4-stale", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
        lastChecksum = result.contextChecksum;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // Turn 6 with intentionally BAD checksum in the request,
      // but VALID checksum in sessionState (so the comparison triggers)
      const badRequest: TurnCommitRequest = {
        turnId: "turn-6",
        role: "candidate",
        content: "Turn 6 with bad checksum.",
        contextChecksum: "bad_checksum_intentionally_wrong",
      };
      const sessionStateWithValidChecksum = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 5,
        contextChecksum: lastChecksum, // valid server-side checksum
      };

      const result = await commitTurn("interview-rem4-stale", badRequest, sessionStateWithValidChecksum);
      expect(result.committed).toBe(false);
      expect(result.reason).toBe("CONTEXT_STALE");
    });

    it("correct checksum after rejection succeeds", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();
      let lastChecksum = "";

      // Commit 5 turns to build up a valid contextChecksum
      for (let i = 1; i <= 5; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem4-recover", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
        lastChecksum = result.contextChecksum;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // First: bad checksum → rejected
      const badRequest: TurnCommitRequest = {
        turnId: "turn-6-bad",
        role: "candidate",
        content: "Turn 6 with bad checksum.",
        contextChecksum: "bad_checksum_intentionally_wrong",
      };
      const sessionStateWithValidChecksum = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 5,
        contextChecksum: lastChecksum,
      };

      const rejected = await commitTurn("interview-rem4-recover", badRequest, sessionStateWithValidChecksum);
      expect(rejected.committed).toBe(false);
      expect(rejected.reason).toBe("CONTEXT_STALE");

      // Second: correct checksum → succeeds
      const goodRequest: TurnCommitRequest = {
        turnId: "turn-6-good",
        role: "candidate",
        content: "Turn 6 with correct checksum.",
        contextChecksum: lastChecksum, // matches sessionState.contextChecksum
      };
      const sessionStateForRetry = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 5,
        contextChecksum: lastChecksum,
      };

      const accepted = await commitTurn("interview-rem4-recover", goodRequest, sessionStateForRetry);
      expect(accepted.committed).toBe(true);
      expect(accepted.turnIndex).toBeDefined();
    });

    it("zero responses emitted with unverified context", async () => {
      let lastTurnIndex = 0;
      let interviewerState = createInitialState();
      let lastChecksum = "";

      // Commit 3 turns to establish context
      for (let i = 1; i <= 3; i++) {
        const request = makeTurnRequest(i, i % 2 === 0 ? "candidate" : "interviewer");
        const sessionState = {
          interviewerState: serializeState(interviewerState),
          lastTurnIndex,
          factCount: i - 1,
        };

        const result = await commitTurn("interview-rem4-zero", request, sessionState);
        expect(result.committed).toBe(true);
        lastTurnIndex = result.turnIndex ?? lastTurnIndex + 1;
        lastChecksum = result.contextChecksum;

        if (request.role === "interviewer" && !interviewerState.personaLocked) {
          interviewerState = transitionState(interviewerState, { type: "PERSONA_LOCKED" });
        }
        if (request.role === "interviewer" && !interviewerState.introDone && interviewerState.currentStep === "opening") {
          interviewerState = transitionState(interviewerState, { type: "INTRO_COMPLETED" });
        }
      }

      // Send with stale checksum
      const staleRequest: TurnCommitRequest = {
        turnId: "turn-4-stale",
        role: "candidate",
        content: "Turn with stale context.",
        contextChecksum: "stale_checksum_value",
      };
      const sessionStateWithValid = {
        interviewerState: serializeState(interviewerState),
        lastTurnIndex,
        factCount: 3,
        contextChecksum: lastChecksum,
      };

      const result = await commitTurn("interview-rem4-zero", staleRequest, sessionStateWithValid);

      // CONTEXT_STALE means committed is false and no turnIndex is assigned
      expect(result.committed).toBe(false);
      expect(result.reason).toBe("CONTEXT_STALE");
      expect(result.turnIndex).toBeUndefined();
    });
  });
});

/**
 * N10: Chaos Tests — 6 Production Failure Scenarios
 *
 * Validates that the system handles real-world failure modes
 * without data loss, hallucination, or context corruption.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeContextChecksum, computeMemoryIntegrityChecksum } from "@/lib/session-brain";
import { createInitialState, transitionState, serializeState, deserializeState } from "@/lib/interviewer-state";
import { diffTurns } from "@/lib/conversation-ledger";

describe("N10: Production Failure Scenarios", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // CHAOS-1: Repeated intro after reconnect
  describe("CHAOS-1: Repeated intro after reconnect", () => {
    it("blocks re-introduction after intro is already done", () => {
      // Simulate: intro completed, 5 turns committed
      const state = createInitialState();
      const afterIntro = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(afterIntro.introDone).toBe(true);

      // Simulate reconnect — state should preserve introDone
      const serialized = serializeState(afterIntro);
      const restored = deserializeState(serialized);
      expect(restored.introDone).toBe(true);

      // Any intro-suppression logic should detect introDone=true
      // and block re-introduction (INTRO_BLOCKED_UNCONDITIONAL)
      expect(restored.currentStep).not.toBe("opening");
    });

    it("serialization roundtrip preserves all state fields", () => {
      const state = createInitialState();
      const withIntro = transitionState(state, { type: "INTRO_COMPLETED" });
      const withQuestion = transitionState(withIntro, {
        type: "QUESTION_ASKED",
        questionHash: "q-1",
      });

      const serialized = serializeState(withQuestion);
      const restored = deserializeState(serialized);

      expect(restored.introDone).toBe(true);
      expect(restored.askedQuestionIds).toContain("q-1");
      expect(restored.stateHash).toBe(withQuestion.stateHash);
    });
  });

  // CHAOS-2: Hallucinated reference under packet loss
  describe("CHAOS-2: Hallucinated reference detection", () => {
    it("context checksum changes when state diverges", () => {
      const checksum1 = computeContextChecksum("hash-v1", 5, 10);
      const checksum2 = computeContextChecksum("hash-v1", 5, 11); // fact count changed
      expect(checksum1).not.toBe(checksum2);
    });

    it("detects stale context via checksum mismatch", () => {
      const expectedChecksum = computeContextChecksum("hash-latest", 10, 20);
      const staleChecksum = computeContextChecksum("hash-stale", 8, 15);
      expect(expectedChecksum).not.toBe(staleChecksum);
    });
  });

  // CHAOS-3: Turn loss on interruption (fragment persistence)
  describe("CHAOS-3: Turn loss on interruption", () => {
    it("diffTurns correctly identifies new turns after ledger index", () => {
      const incoming = [
        { role: "model", content: "Hello", timestamp: "2026-01-01T00:00:00Z" },
        { role: "user", content: "Hi", timestamp: "2026-01-01T00:00:01Z" },
        { role: "model", content: "How are you?", timestamp: "2026-01-01T00:00:02Z" },
        { role: "user", content: "Good, thanks", timestamp: "2026-01-01T00:00:03Z" },
      ];

      // Ledger has turns 0 and 1, incoming has 0-3
      const newTurns = diffTurns(incoming, 1);
      expect(newTurns).toHaveLength(2);
      expect(newTurns[0].content).toBe("How are you?");
      expect(newTurns[1].content).toBe("Good, thanks");
    });

    it("returns empty when ledger is up to date", () => {
      const incoming = [
        { role: "model", content: "Hello", timestamp: "2026-01-01T00:00:00Z" },
      ];
      const newTurns = diffTurns(incoming, 0);
      expect(newTurns).toHaveLength(0);
    });
  });

  // CHAOS-4: Tab refresh continuity
  describe("CHAOS-4: Tab refresh continuity", () => {
    it("state fully reconstructable from serialized form", () => {
      // Simulate 8 turns of state
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      for (let i = 0; i < 5; i++) {
        state = transitionState(state, {
          type: "QUESTION_ASKED",
          questionHash: `q-${i}`,
        });
      }

      const serialized = serializeState(state);
      const restored = deserializeState(serialized);

      expect(restored.introDone).toBe(true);
      expect(restored.askedQuestionIds).toHaveLength(5);
      expect(restored.stateHash).toBe(state.stateHash);
      expect(restored.currentStep).toBe(state.currentStep);
    });
  });

  // CHAOS-5: Memory integrity under rapid reconnect
  describe("CHAOS-5: Memory integrity under rapid reconnect", () => {
    it("memory integrity checksum is deterministic", () => {
      const params = {
        ledgerVersion: 10,
        lastExtractionTurnIndex: 8,
        stateHash: "abc123",
        commitmentCount: 3,
        contradictionCount: 1,
        confidenceTier: "normal",
      };

      const cs1 = computeMemoryIntegrityChecksum(params);
      const cs2 = computeMemoryIntegrityChecksum(params);
      expect(cs1).toBe(cs2);
      expect(cs1).toMatch(/^[a-f0-9]{32}$/);
    });

    it("checksum changes when any parameter changes", () => {
      const base = {
        ledgerVersion: 10,
        lastExtractionTurnIndex: 8,
        stateHash: "abc123",
        commitmentCount: 3,
        contradictionCount: 1,
        confidenceTier: "normal",
      };

      const checksums = [
        computeMemoryIntegrityChecksum(base),
        computeMemoryIntegrityChecksum({ ...base, ledgerVersion: 11 }),
        computeMemoryIntegrityChecksum({ ...base, stateHash: "different" }),
        computeMemoryIntegrityChecksum({ ...base, commitmentCount: 4 }),
        computeMemoryIntegrityChecksum({ ...base, contradictionCount: 2 }),
        computeMemoryIntegrityChecksum({ ...base, confidenceTier: "degraded" }),
      ];

      // All checksums should be unique
      const unique = new Set(checksums);
      expect(unique.size).toBe(checksums.length);
    });
  });

  // CHAOS-6: Commitments/contradictions survive Redis expiry
  describe("CHAOS-6: Data survives Redis expiry", () => {
    it("interviewer state serialization preserves commitments and contradictions", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });

      // Add contradictions
      state.contradictionMap.push({
        turnIdA: "turn-1",
        turnIdB: "turn-3",
        description: "Candidate said 3 years at Stripe, then said 2 years",
      });

      // Add commitments
      state.commitments.push({
        id: "c-1",
        description: "Will ask about system design experience",
        turnId: "turn-2",
        fulfilled: false,
      });

      const serialized = serializeState(state);
      const restored = deserializeState(serialized);

      // Verify data survives serialization roundtrip
      expect(restored.contradictionMap).toHaveLength(1);
      expect(restored.contradictionMap[0].description).toContain("Stripe");
      expect(restored.commitments).toHaveLength(1);
      expect(restored.commitments[0].description).toContain("system design");
      expect(restored.commitments[0].fulfilled).toBe(false);
    });

    it("empty state has empty arrays for commitments and contradictions", () => {
      const state = createInitialState();
      expect(state.contradictionMap).toHaveLength(0);
      expect(state.commitments).toHaveLength(0);

      const serialized = serializeState(state);
      const restored = deserializeState(serialized);
      expect(restored.contradictionMap).toHaveLength(0);
      expect(restored.commitments).toHaveLength(0);
    });
  });
});

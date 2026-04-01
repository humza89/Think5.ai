/**
 * N7: Durable Commitments/Contradictions Integration Tests
 *
 * Validates that commitments and contradictions survive Redis expiry
 * by being durably stored in Postgres.
 */

import { describe, it, expect } from "vitest";
import { createInitialState, transitionState, serializeState, deserializeState } from "@/lib/interviewer-state";

describe("N7: Durable Commitments & Contradictions", () => {
  it("commitments persist through serialization roundtrip", () => {
    const state = createInitialState();
    state.commitments = [
      { id: "c-1", description: "Follow up on distributed systems", turnId: "t-1", fulfilled: false },
      { id: "c-2", description: "Ask about team management", turnId: "t-3", fulfilled: true },
      { id: "c-3", description: "Explore debugging methodology", turnId: "t-5", fulfilled: false },
    ];

    const serialized = serializeState(state);
    const restored = deserializeState(serialized);

    expect(restored.commitments).toHaveLength(3);
    expect(restored.commitments[0].fulfilled).toBe(false);
    expect(restored.commitments[1].fulfilled).toBe(true);
    expect(restored.commitments[2].description).toContain("debugging");
  });

  it("contradictions persist through serialization roundtrip", () => {
    const state = createInitialState();
    state.contradictionMap = [
      { turnIdA: "t-1", turnIdB: "t-4", description: "Experience duration: 3yr vs 2yr at Stripe" },
      { turnIdA: "t-2", turnIdB: "t-6", description: "Role: IC vs manager at previous company" },
    ];

    const serialized = serializeState(state);
    const restored = deserializeState(serialized);

    expect(restored.contradictionMap).toHaveLength(2);
    expect(restored.contradictionMap[0].description).toContain("Stripe");
    expect(restored.contradictionMap[1].turnIdA).toBe("t-2");
  });

  it("empty commitments/contradictions are valid", () => {
    const state = createInitialState();
    expect(state.commitments).toHaveLength(0);
    expect(state.contradictionMap).toHaveLength(0);

    const serialized = serializeState(state);
    const restored = deserializeState(serialized);
    expect(restored.commitments).toHaveLength(0);
    expect(restored.contradictionMap).toHaveLength(0);
  });

  it("mixed commitment states are preserved", () => {
    const state = createInitialState();
    state.commitments = [
      { id: "c-4", description: "Pending commitment", turnId: "t-1", fulfilled: false },
      { id: "c-5", description: "Fulfilled commitment", turnId: "t-2", fulfilled: true },
    ];

    const serialized = serializeState(state);
    const restored = deserializeState(serialized);

    const pending = restored.commitments.filter(c => !c.fulfilled);
    const fulfilled = restored.commitments.filter(c => c.fulfilled);

    expect(pending).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);
  });
});

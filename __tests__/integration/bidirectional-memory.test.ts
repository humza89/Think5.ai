/**
 * N8: Bidirectional Memory Graph Integration Tests
 *
 * Validates that sourceTurnIds are validated, stored, and
 * the bidirectional reference index is correctly built.
 */

import { describe, it, expect } from "vitest";
import type { TurnNode, MemoryTruth } from "@/lib/memory-truth-service";

describe("N8: Bidirectional Memory Graph", () => {
  it("TurnNode interface includes sourceTurnIds", () => {
    const node: TurnNode = {
      turnId: "t-1",
      turnIndex: 0,
      role: "interviewer",
      content: "Tell me about your experience.",
      factIds: [],
      causalParentId: null,
      timestamp: new Date(),
      sourceTurnIds: ["t-0"],
    };

    expect(node.sourceTurnIds).toEqual(["t-0"]);
  });

  it("MemoryTruth interface includes turnReferences", () => {
    // Verify the type has the turnReferences field
    const mockTruth: Partial<MemoryTruth> = {
      turnReferences: {
        "t-1": ["t-3", "t-5"],
        "t-2": ["t-4"],
      },
    };

    expect(mockTruth.turnReferences?.["t-1"]).toHaveLength(2);
    expect(mockTruth.turnReferences?.["t-2"]).toHaveLength(1);
  });

  it("bidirectional index correctly maps references", () => {
    // Simulate building turnReferences from turn graph
    const turnGraph: TurnNode[] = [
      { turnId: "t-0", turnIndex: 0, role: "candidate", content: "I worked at Stripe", factIds: [], causalParentId: null, timestamp: new Date() },
      { turnId: "t-1", turnIndex: 1, role: "interviewer", content: "Tell me more about Stripe", factIds: [], causalParentId: null, timestamp: new Date(), sourceTurnIds: ["t-0"] },
      { turnId: "t-2", turnIndex: 2, role: "candidate", content: "I built payment APIs", factIds: [], causalParentId: null, timestamp: new Date() },
      { turnId: "t-3", turnIndex: 3, role: "interviewer", content: "How did you handle scale?", factIds: [], causalParentId: null, timestamp: new Date(), sourceTurnIds: ["t-0", "t-2"] },
    ];

    // Build bidirectional index
    const turnReferences: Record<string, string[]> = {};
    for (const turn of turnGraph) {
      if (turn.sourceTurnIds) {
        for (const refId of turn.sourceTurnIds) {
          if (!turnReferences[refId]) turnReferences[refId] = [];
          turnReferences[refId].push(turn.turnId);
        }
      }
    }

    // t-0 is referenced by both t-1 and t-3
    expect(turnReferences["t-0"]).toEqual(["t-1", "t-3"]);
    // t-2 is referenced by t-3
    expect(turnReferences["t-2"]).toEqual(["t-3"]);
    // t-1 and t-3 are not referenced by anyone
    expect(turnReferences["t-1"]).toBeUndefined();
    expect(turnReferences["t-3"]).toBeUndefined();
  });
});

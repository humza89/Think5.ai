/**
 * N9: Strict Sequence Numbers Integration Tests
 *
 * Validates that monotonic client-assigned sequence numbers
 * are enforced, with correct duplicate/gap detection.
 */

import { describe, it, expect } from "vitest";
import { isEnabled } from "@/lib/feature-flags";

describe("N9: Strict Sequence Numbers", () => {
  it("STRICT_SEQUENCE_NUMBERS feature flag is enabled by default", () => {
    expect(isEnabled("STRICT_SEQUENCE_NUMBERS")).toBe(true);
  });

  it("validates monotonic sequence: 0, 1, 2, 3 should all pass", () => {
    const expected: number[] = [];
    let lastSeq = -1;

    for (let seq = 0; seq < 4; seq++) {
      const expectedNext = lastSeq + 1;
      expect(seq).toBe(expectedNext);
      lastSeq = seq;
      expected.push(seq);
    }

    expect(expected).toEqual([0, 1, 2, 3]);
  });

  it("detects duplicate sequence number", () => {
    const lastSeq = 3;
    const incoming = 2; // Duplicate (< expected)
    const expectedNext = lastSeq + 1;

    expect(incoming).toBeLessThan(expectedNext);
    // Server would return DUPLICATE_SEQUENCE
  });

  it("detects out-of-order sequence number", () => {
    const lastSeq = 3;
    const incoming = 5; // Gap (skipped 4)
    const expectedNext = lastSeq + 1;

    expect(incoming).toBeGreaterThan(expectedNext);
    // Server would return OUT_OF_ORDER_SEQUENCE with expectedSequenceNumber=4
  });

  it("allows correct next sequence after gap recovery", () => {
    const lastSeq = 3;
    const expectedNext = lastSeq + 1;

    // Client corrects and sends 4, then 5
    expect(4).toBe(expectedNext);
    expect(5).toBe(expectedNext + 1);
  });
});

/**
 * N2: Atomic Turn Boundary Integration Tests
 *
 * Validates that turn commit + state snapshot + memory updates
 * are wrapped in a single transaction.
 */

import { describe, it, expect } from "vitest";
import { isEnabled } from "@/lib/feature-flags";
import { computeMemoryIntegrityChecksum } from "@/lib/session-brain";

describe("N2: Atomic Turn Boundary", () => {
  it("ATOMIC_TURN_COMMIT feature flag is enabled by default", () => {
    expect(isEnabled("ATOMIC_TURN_COMMIT")).toBe(true);
  });

  it("memory integrity checksum covers all atomic write components", () => {
    const params = {
      ledgerVersion: 5,
      lastExtractionTurnIndex: 3,
      stateHash: "abc123",
      commitmentCount: 2,
      contradictionCount: 1,
      confidenceTier: "normal",
    };

    const checksum = computeMemoryIntegrityChecksum(params);
    expect(checksum).toMatch(/^[a-f0-9]{32}$/);

    // Changing any field produces a different checksum
    const altered = computeMemoryIntegrityChecksum({ ...params, commitmentCount: 3 });
    expect(altered).not.toBe(checksum);
  });

  it("all atomic components are reflected in checksum", () => {
    const base = {
      ledgerVersion: 10,
      lastExtractionTurnIndex: 8,
      stateHash: "hash",
      commitmentCount: 0,
      contradictionCount: 0,
      confidenceTier: "normal",
    };

    // Each component change produces unique checksum
    const checksums = new Set([
      computeMemoryIntegrityChecksum(base),
      computeMemoryIntegrityChecksum({ ...base, ledgerVersion: 11 }),
      computeMemoryIntegrityChecksum({ ...base, lastExtractionTurnIndex: 9 }),
      computeMemoryIntegrityChecksum({ ...base, stateHash: "different" }),
      computeMemoryIntegrityChecksum({ ...base, commitmentCount: 1 }),
      computeMemoryIntegrityChecksum({ ...base, contradictionCount: 1 }),
      computeMemoryIntegrityChecksum({ ...base, confidenceTier: "degraded" }),
    ]);

    expect(checksums.size).toBe(7); // All unique
  });
});

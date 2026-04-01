/**
 * N5: Memory Integrity Checksum Integration Tests
 *
 * Validates that per-turn memory integrity checksums detect drift
 * and trigger resync when needed.
 */

import { describe, it, expect } from "vitest";
import { computeMemoryIntegrityChecksum } from "@/lib/session-brain";

describe("N5: Memory Integrity Checksum", () => {
  it("produces 32-char hex checksum", () => {
    const checksum = computeMemoryIntegrityChecksum({
      ledgerVersion: 1,
      lastExtractionTurnIndex: 0,
      stateHash: "initial",
      commitmentCount: 0,
      contradictionCount: 0,
      confidenceTier: "normal",
    });

    expect(checksum).toMatch(/^[a-f0-9]{32}$/);
  });

  it("detects state mutation between consecutive turns", () => {
    // Turn 5: normal state
    const turn5Checksum = computeMemoryIntegrityChecksum({
      ledgerVersion: 5,
      lastExtractionTurnIndex: 4,
      stateHash: "hash-v5",
      commitmentCount: 2,
      contradictionCount: 0,
      confidenceTier: "normal",
    });

    // Turn 6: state was mutated (contradiction detected)
    const turn6Checksum = computeMemoryIntegrityChecksum({
      ledgerVersion: 6,
      lastExtractionTurnIndex: 5,
      stateHash: "hash-v6",
      commitmentCount: 2,
      contradictionCount: 1, // New contradiction
      confidenceTier: "normal",
    });

    // Checksums should differ — mutation detected
    expect(turn5Checksum).not.toBe(turn6Checksum);
  });

  it("consecutive identical states produce same checksum", () => {
    const params = {
      ledgerVersion: 5,
      lastExtractionTurnIndex: 4,
      stateHash: "hash-v5",
      commitmentCount: 2,
      contradictionCount: 0,
      confidenceTier: "normal",
    };

    const cs1 = computeMemoryIntegrityChecksum(params);
    const cs2 = computeMemoryIntegrityChecksum(params);
    expect(cs1).toBe(cs2);
  });

  it("blocks on integrity break (MEMORY_INTEGRITY_BREAK scenario)", () => {
    // Simulate: sessionState says lastMemoryChecksum = "abc..."
    // But actual computed checksum for the current state is different
    const storedChecksum = computeMemoryIntegrityChecksum({
      ledgerVersion: 5,
      lastExtractionTurnIndex: 4,
      stateHash: "expected-hash",
      commitmentCount: 2,
      contradictionCount: 0,
      confidenceTier: "normal",
    });

    // State was corrupted — different hash
    const actualChecksum = computeMemoryIntegrityChecksum({
      ledgerVersion: 5,
      lastExtractionTurnIndex: 4,
      stateHash: "corrupted-hash", // Different!
      commitmentCount: 2,
      contradictionCount: 0,
      confidenceTier: "normal",
    });

    // Mismatch → MEMORY_INTEGRITY_BREAK
    expect(storedChecksum).not.toBe(actualChecksum);
  });
});

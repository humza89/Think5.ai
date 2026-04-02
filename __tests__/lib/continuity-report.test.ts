/**
 * Continuity Report Tests — Fix 9 enterprise validation
 */

import { describe, it, expect, vi } from "vitest";

// Mock prisma before import
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interviewTranscript: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

describe("Continuity Report (Fix 9)", () => {
  it("grades GREEN for clean interview with no events", async () => {
    const { generateContinuityReport } = await import(
      "@/lib/continuity-report"
    );
    const report = await generateContinuityReport("test-interview-clean");
    expect(report.grade).toBe("GREEN");
    expect(report.totalReconnects).toBe(0);
    expect(report.gateViolations.outputGate).toBe(0);
    expect(report.incidents).toHaveLength(0);
  });

  it("has correct report structure", async () => {
    const { generateContinuityReport } = await import(
      "@/lib/continuity-report"
    );
    const report = await generateContinuityReport("test-interview-structure");
    expect(report).toHaveProperty("interviewId");
    expect(report).toHaveProperty("grade");
    expect(report).toHaveProperty("totalReconnects");
    expect(report).toHaveProperty("memoryConfidence");
    expect(report).toHaveProperty("gateViolations");
    expect(report).toHaveProperty("contextResets");
    expect(report).toHaveProperty("introSuppressions");
    expect(report).toHaveProperty("hallucinationDetections");
    expect(report).toHaveProperty("incidents");
  });
});

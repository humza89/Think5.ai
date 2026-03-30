import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Session Store Fail-Closed Tests
 *
 * Verifies that when FAIL_CLOSED_PRODUCTION is enabled, failures
 * in the save path throw instead of silently falling back to in-memory storage.
 *
 * Tests exercise the no-Redis fallback path (lines 165-170 in session-store.ts)
 * because mocking the lazy-init Redis client is fragile in vitest.
 */

// Track feature flag state
const featureFlags: Record<string, boolean> = {};

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (flag: string) => featureFlags[flag] ?? false,
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// Don't set Redis env vars — this forces getRedis() to return null,
// exercising the no-durable-store fallback path
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { saveSessionState } from "@/lib/session-store";

describe("Session Store — Fail-Closed Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(featureFlags).forEach((k) => delete featureFlags[k]);
  });

  it("throws when no durable store and FAIL_CLOSED_PRODUCTION enabled", async () => {
    featureFlags["FAIL_CLOSED_PRODUCTION"] = true;

    await expect(
      saveSessionState("test-interview-1", {
        interviewId: "test-interview-1",
        moduleScores: [],
        questionCount: 0,
      } as any)
    ).rejects.toThrow("no durable store available");
  });

  it("falls back to in-memory when FAIL_CLOSED_PRODUCTION disabled", async () => {
    featureFlags["FAIL_CLOSED_PRODUCTION"] = false;

    // Should NOT throw — falls back to memory
    await expect(
      saveSessionState("test-interview-2", {
        interviewId: "test-interview-2",
        moduleScores: [],
        questionCount: 0,
      } as any)
    ).resolves.toBeUndefined();
  });
});

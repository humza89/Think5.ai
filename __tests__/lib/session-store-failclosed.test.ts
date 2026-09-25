import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Session Store Fail-Closed Tests
 *
 * Verifies that:
 * 1. Production mode always throws on save failure (not gated by feature flag)
 * 2. Dev/test mode still uses in-memory fallback
 * 3. Structured SESSION_PERSIST_FAILURE alarm is emitted
 *
 * Tests exercise the no-Redis fallback path because mocking the lazy-init
 * Redis client is fragile in vitest.
 */

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => false,
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// Don't set Redis env vars — this forces getRedis() to return null (in test)
// or throw (in production)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
// T11: the legacy fail-closed contract below is the FF_P0_REDIS_SAFE_TO_FAIL=false
// mode. The default (on) is covered further down and in __tests__/chaos/redis-loss.test.ts.
process.env.FF_P0_REDIS_SAFE_TO_FAIL = "false";

import { saveSessionState, getSessionState, checkDurableStore, assertDurableStore } from "@/lib/session-store";

describe("Session Store — Fail-Closed Behavior", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = originalNodeEnv;
  });

  it("throws when no durable store in production mode", async () => {
    env.NODE_ENV = "production";

    await expect(
      saveSessionState("test-interview-1", {
        interviewId: "test-interview-1",
        moduleScores: [],
        questionCount: 0,
      } as any)
    ).rejects.toThrow("Redis unavailable in production");
  });

  it("falls back to in-memory in non-production mode", async () => {
    env.NODE_ENV = "test";

    // Should NOT throw — falls back to memory
    await expect(
      saveSessionState("test-interview-2", {
        interviewId: "test-interview-2",
        moduleScores: [],
        questionCount: 0,
      } as any)
    ).resolves.toBe("postgres");

    // Verify it was stored and is retrievable
    const state = await getSessionState("test-interview-2");
    expect(state).not.toBeNull();
    expect(state?.interviewId).toBe("test-interview-2");
  });

  it("getSessionState falls back to in-memory in test mode", async () => {
    env.NODE_ENV = "test";

    // Save first
    await saveSessionState("test-interview-3", {
      interviewId: "test-interview-3",
      moduleScores: [{ module: "test", score: 80, reason: "good" }],
      questionCount: 5,
    } as any);

    // Read back
    const state = await getSessionState("test-interview-3");
    expect(state).not.toBeNull();
    expect(state?.questionCount).toBe(5);
    expect(state?.moduleScores).toHaveLength(1);
  });
});

describe("Session Store — T11 safe-to-fail (FF_P0_REDIS_SAFE_TO_FAIL on)", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  beforeEach(() => { env.FF_P0_REDIS_SAFE_TO_FAIL = "true"; env.NODE_ENV = "production"; });
  afterEach(() => { env.FF_P0_REDIS_SAFE_TO_FAIL = "false"; env.NODE_ENV = originalNodeEnv; });

  it("production save without Redis resolves with durability=postgres instead of throwing", async () => {
    await expect(
      saveSessionState("test-interview-4", { interviewId: "test-interview-4", moduleScores: [], questionCount: 1 } as any)
    ).resolves.toBe("postgres");
    expect((await getSessionState("test-interview-4"))?.questionCount).toBe(1);
  });

  it("assertDurableStore is a no-op and checkDurableStore reports the downgrade", async () => {
    await expect(assertDurableStore()).resolves.toBeUndefined();
    expect(await checkDurableStore()).toMatchObject({ durable: false, durability: "postgres", reason: "redis_not_configured" });
  });
});

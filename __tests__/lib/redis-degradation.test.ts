import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const incrementCounter = vi.fn();
vi.mock("@/lib/metrics", () => ({ incrementCounter: (...args: unknown[]) => incrementCounter(...args) }));

import {
  noteRedisDegraded,
  redisDegradationStatus,
  redisSafeToFailEnabled,
  reportRedisConfiguration,
  resetRedisDegradationForTests,
  withRedisTimeout,
} from "@/lib/redis-degradation";
import { logger } from "@/lib/logger";

describe("redis-degradation (T11)", () => {
  beforeEach(() => {
    resetRedisDegradationForTests();
    incrementCounter.mockClear();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.restoreAllMocks());

  it("FF_P0_REDIS_SAFE_TO_FAIL defaults on and honours explicit off values", () => {
    vi.stubEnv("FF_P0_REDIS_SAFE_TO_FAIL", "");
    expect(redisSafeToFailEnabled()).toBe(true);
    for (const v of ["false", "0", "off", "NO"]) {
      vi.stubEnv("FF_P0_REDIS_SAFE_TO_FAIL", v);
      expect(redisSafeToFailEnabled()).toBe(false);
    }
    vi.stubEnv("FF_P0_REDIS_SAFE_TO_FAIL", "true");
    expect(redisSafeToFailEnabled()).toBe(true);
  });

  it("counts every degradation but logs at most once per minute per component", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const t0 = 1_000_000;
    noteRedisDegraded("rate-limit", new Error("ECONNRESET"), t0);
    noteRedisDegraded("rate-limit", new Error("ECONNRESET"), t0 + 1_000);
    noteRedisDegraded("session-store", new Error("timeout"), t0 + 2_000);
    noteRedisDegraded("rate-limit", new Error("ECONNRESET"), t0 + 61_000);
    expect(incrementCounter).toHaveBeenCalledTimes(4);
    expect(incrementCounter).toHaveBeenCalledWith("redis_degraded_total", expect.any(String), { component: "rate-limit" });
    expect(warn).toHaveBeenCalledTimes(3); // rate-limit @t0, session-store, rate-limit @t0+61s
    expect(redisDegradationStatus()).toEqual({ lastDegradedAt: new Date(t0 + 61_000).toISOString(), counts: { "rate-limit": 3, "session-store": 1 } });
  });

  it("bounds a hung Redis call", async () => {
    const never = new Promise<string>(() => {});
    await expect(withRedisTimeout(never, 20, "ping")).rejects.toThrow(/Redis timeout after 20ms \(ping\)/);
    await expect(withRedisTimeout(Promise.resolve("PONG"), 20, "ping")).resolves.toBe("PONG");
  });

  it("reports (never throws) on missing configuration in production", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const report = reportRedisConfiguration({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(report).toMatchObject({ configured: false, production: true, safeToFail: true });
    expect(report.message).toMatch(/durability=postgres/);
    expect(error).toHaveBeenCalledTimes(1);
    expect(reportRedisConfiguration({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" } as NodeJS.ProcessEnv)).toMatchObject({ configured: true });
  });
});

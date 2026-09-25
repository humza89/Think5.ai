/**
 * T11 Step 7 chaos test: the Redis client rejects every call. Under
 * FF_P0_REDIS_SAFE_TO_FAIL (default on) an interview still starts and
 * checkpoints with durability "postgres"; with the flag off the legacy
 * fail-closed behaviour is preserved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisCalls: string[] = [];
class RejectingRedis {
  constructor(_opts: unknown) {}
  private fail(name: string) {
    redisCalls.push(name);
    return Promise.reject(new Error(`ECONNREFUSED (${name})`));
  }
  ping() { return this.fail("ping"); }
  get() { return this.fail("get"); }
  set() { return this.fail("set"); }
  del() { return this.fail("del"); }
  incr() { return this.fail("incr"); }
  expire() { return this.fail("expire"); }
  ttl() { return this.fail("ttl"); }
  eval() { return this.fail("eval"); }
  zremrangebyscore() { return this.fail("zremrangebyscore"); }
  zcard() { return this.fail("zcard"); }
  zadd() { return this.fail("zadd"); }
  zrem() { return this.fail("zrem"); }
  incrbyfloat() { return this.fail("incrbyfloat"); }
}
vi.mock("@upstash/redis", () => ({ Redis: RejectingRedis }));
vi.mock("@/lib/slo-monitor", () => ({ recordSLOEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/feature-flags", () => ({ isEnabled: () => false, FeatureFlags: {} }));

const env = process.env as Record<string, string | undefined>;

async function freshModules() {
  vi.resetModules();
  const sessionStore = await import("@/lib/session-store");
  const rateLimit = await import("@/lib/rate-limit");
  const limiter = await import("@/lib/concurrent-session-limiter");
  const degradation = await import("@/lib/redis-degradation");
  const metrics = await import("@/lib/metrics");
  return { sessionStore, rateLimit, limiter, degradation, metrics };
}

describe("CHAOS (T11): Redis rejects every call", () => {
  const original = { ...process.env };
  beforeEach(() => {
    redisCalls.length = 0;
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
    env.UPSTASH_REDIS_REST_TOKEN = "token";
    env.SESSION_RETRY_COUNT = "1";
    env.SESSION_RETRY_BASE_MS = "1";
    env.REDIS_CALL_TIMEOUT_MS = "200";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in original)) delete env[k];
    Object.assign(process.env, original);
    vi.restoreAllMocks();
  });

  it("safe-to-fail (default): interview proceeds with durability=postgres and the outage is counted", async () => {
    delete env.FF_P0_REDIS_SAFE_TO_FAIL;
    const { sessionStore, rateLimit, limiter, metrics } = await freshModules();

    // voice-init's gate: reports, does not throw
    await expect(sessionStore.assertDurableStore()).resolves.toBeUndefined();
    const status = await sessionStore.checkDurableStore();
    expect(status).toMatchObject({ durable: false, durability: "postgres" });
    expect(status.reason).toMatch(/ECONNREFUSED|timeout/);

    // lock, slot and rate limit all degrade instead of failing the request
    const lock = await sessionStore.acquireSessionLock("chaos-int-1");
    expect(lock.acquired).toBe(true);
    expect(await sessionStore.acquireSessionLock("chaos-int-1")).toMatchObject({ acquired: false });
    expect(await limiter.acquireSessionSlot("chaos-int-1")).toBe(true);
    expect((await rateLimit.checkRateLimit("chaos:ip", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await rateLimit.checkRateLimit("chaos:ip", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await rateLimit.checkRateLimit("chaos:ip", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(false); // memory limiter still limits

    // checkpoint write returns the downgraded durability and remains readable
    const durability = await sessionStore.saveSessionState("chaos-int-1", { interviewId: "chaos-int-1", moduleScores: [], questionCount: 2 } as never);
    expect(durability).toBe("postgres");
    expect((await sessionStore.getSessionState("chaos-int-1"))?.questionCount).toBe(2);

    // the degradation is observable
    const exported = metrics.exportPrometheusMetrics();
    expect(exported).toMatch(/redis_degraded_total\{component="session-store"\}/);
    expect(exported).toMatch(/redis_degraded_total\{component="rate-limit"\}/);
    expect(exported).toMatch(/redis_degraded_total\{component="session-limiter"\}/);
    expect(exported).toMatch(/redis_degraded_total\{component="session-lock"\}/);
    expect(redisCalls.length).toBeGreaterThan(0);
  });

  it("flag off: legacy fail-closed behaviour is unchanged", async () => {
    env.FF_P0_REDIS_SAFE_TO_FAIL = "false";
    const { sessionStore, rateLimit, limiter } = await freshModules();
    await expect(sessionStore.saveSessionState("chaos-int-2", { interviewId: "chaos-int-2", moduleScores: [], questionCount: 0 } as never)).rejects.toThrow(/Redis write failure/);
    expect(await limiter.acquireSessionSlot("chaos-int-2")).toBe(false);
    expect((await rateLimit.checkRateLimit("chaos:ip2", { maxRequests: 5, windowMs: 60_000 })).allowed).toBe(false);
    await expect(sessionStore.acquireSessionLock("chaos-int-2")).rejects.toThrow();
  });
});

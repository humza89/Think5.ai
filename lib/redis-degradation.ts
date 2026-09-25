/**
 * Redis degradation helpers (Phase 0 T11: relay and Redis safe-to-fail).
 *
 * Redis (Upstash) is an accelerator, never authoritative state. When it is
 * unreachable, callers downgrade instead of failing: limiters fall back to
 * their in-memory implementation, the session store reports
 * `durability: "postgres"`, and the interview continues. Every downgrade is
 * counted in `redis_degraded_total{component}` and logged at most once per
 * minute per component so an outage is visible without flooding logs.
 *
 * The legacy fail-closed behaviour stays available behind
 * `FF_P0_REDIS_SAFE_TO_FAIL=false` (default on), matching the Phase 0 plan's
 * flag rule for behaviour changes.
 */
import { incrementCounter } from "@/lib/metrics";
import { logger } from "@/lib/logger";

export type RedisComponent =
  | "rate-limit"
  | "session-limiter"
  | "session-store"
  | "session-lock"
  | "slo-monitor"
  | "session-store-adapter";

export interface RedisConfigurationReport {
  configured: boolean;
  production: boolean;
  safeToFail: boolean;
  message: string;
}

const LOG_INTERVAL_MS = 60_000;
const lastLoggedAt = new Map<string, number>();
let lastDegradedAt: number | null = null;
const degradedCounts = new Map<string, number>();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE;
}

/** `FF_P0_REDIS_SAFE_TO_FAIL` (default on): downgrade instead of failing closed. */
export function redisSafeToFailEnabled(): boolean {
  const raw = process.env.FF_P0_REDIS_SAFE_TO_FAIL;
  if (raw === undefined || raw === "") return true;
  return !["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
}

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Record a Redis degradation for `component`. Always increments the counter;
 * logs at most once per minute per component.
 */
export function noteRedisDegraded(component: RedisComponent, error?: unknown, now: number = Date.now()): void {
  lastDegradedAt = now;
  degradedCounts.set(component, (degradedCounts.get(component) ?? 0) + 1);
  incrementCounter("redis_degraded_total", "Redis unavailable; component fell back to its degraded mode", { component });
  const last = lastLoggedAt.get(component) ?? 0;
  if (now - last < LOG_INTERVAL_MS) return;
  lastLoggedAt.set(component, now);
  logger.warn("[redis] degraded — continuing without the accelerator", {
    component,
    safeToFail: redisSafeToFailEnabled(),
    occurrences: degradedCounts.get(component),
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
  });
}

/** Snapshot for health endpoints. */
export function redisDegradationStatus(): { lastDegradedAt: string | null; counts: Record<string, number> } {
  return {
    lastDegradedAt: lastDegradedAt ? new Date(lastDegradedAt).toISOString() : null,
    counts: Object.fromEntries(degradedCounts),
  };
}

/** Test hook. */
export function resetRedisDegradationForTests(): void {
  lastLoggedAt.clear();
  degradedCounts.clear();
  lastDegradedAt = null;
}

/**
 * Bound a Redis call. Upstash's REST client has no default timeout, so a
 * hung network path would otherwise stall voice-init indefinitely.
 */
export async function withRedisTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Redis timeout after ${ms}ms (${label})`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const REDIS_CALL_TIMEOUT_MS = parseInt(process.env.REDIS_CALL_TIMEOUT_MS || "3000", 10);

/**
 * Startup check (Step 3): report, never crash. Called from instrumentation.ts.
 */
export function reportRedisConfiguration(env: NodeJS.ProcessEnv = process.env): RedisConfigurationReport {
  const configured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  const production = env.NODE_ENV === "production" && !env.NEXT_PHASE;
  const safeToFail = redisSafeToFailEnabled();
  let message: string;
  if (configured) {
    message = "Upstash Redis configured";
  } else if (production && safeToFail) {
    message = "UPSTASH_REDIS_REST_URL/TOKEN missing in production — running with durability=postgres (rate limits and session hot-cache are per-instance). Set them in Vercel production and preview.";
  } else if (production) {
    message = "UPSTASH_REDIS_REST_URL/TOKEN missing in production and FF_P0_REDIS_SAFE_TO_FAIL=false — voice-init will fail closed.";
  } else {
    message = "Upstash Redis not configured — using in-memory fallbacks (dev/test)";
  }
  const report = { configured, production, safeToFail, message };
  if (production && !configured) logger.error(`[redis] ${message}`);
  else if (!configured) logger.warn(`[redis] ${message}`);
  return report;
}

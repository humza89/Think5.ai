/**
 * Concurrent Session Limiter — enforces maximum simultaneous interview sessions.
 *
 * Uses Redis sorted sets to track active sessions with automatic expiry.
 * Prevents resource exhaustion under load.
 */

import { logger } from "@/lib/logger";
import { noteRedisDegraded, redisSafeToFailEnabled } from "@/lib/redis-degradation";

const DEFAULT_MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_INTERVIEWS || "500", 10);
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — sessions auto-expire

// T11 in-memory fallback: per-instance slot tracking used when Redis is
// unavailable and FF_P0_REDIS_SAFE_TO_FAIL is on. Weaker than the shared
// sorted set (each serverless instance counts only its own sessions) but it
// keeps interviews starting during a Redis outage instead of refusing all of
// them; the downgrade is counted in redis_degraded_total{component="session-limiter"}.
const memorySlots = new Map<string, number>();
function acquireSlotInMemory(interviewId: string, now = Date.now()): boolean {
  for (const [id, startedAt] of memorySlots) if (now - startedAt > SESSION_TTL_MS) memorySlots.delete(id);
  if (memorySlots.has(interviewId)) return true;
  if (memorySlots.size >= DEFAULT_MAX_CONCURRENT) return false;
  memorySlots.set(interviewId, now);
  return true;
}

let _redis: any = null;
async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

/**
 * Try to acquire a session slot. Returns true if under the limit.
 */
export async function acquireSessionSlot(interviewId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      if (!redisSafeToFailEnabled()) {
        logger.error("[session-limiter] Redis unavailable in production — rejecting session (FF_P0_REDIS_SAFE_TO_FAIL=false)");
        return false;
      }
      noteRedisDegraded("session-limiter", "not configured");
      return acquireSlotInMemory(interviewId);
    }
    return true; // No Redis = allow (local dev only)
  }

  const now = Date.now();
  const key = "active-sessions";

  try {
    // Remove expired sessions (score < now - TTL)
    await redis.zremrangebyscore(key, 0, now - SESSION_TTL_MS);

    // Check current count
    const count = await redis.zcard(key);
    if (count >= DEFAULT_MAX_CONCURRENT) {
      logger.warn(`[session-limiter] Concurrent limit reached: ${count}/${DEFAULT_MAX_CONCURRENT}`);
      return false;
    }

    // Add this session
    await redis.zadd(key, { score: now, member: interviewId });
    return true;
  } catch (err) {
    if (process.env.NODE_ENV === "production" && !redisSafeToFailEnabled()) {
      logger.error("[session-limiter] Redis error during session acquisition — fail-closed (FF_P0_REDIS_SAFE_TO_FAIL=false)", err as Record<string, unknown>);
      return false;
    }
    // T11: degrade to the per-instance limiter rather than refusing every interview.
    noteRedisDegraded("session-limiter", err);
    return acquireSlotInMemory(interviewId);
  }
}

/**
 * Release a session slot when an interview ends.
 */
export async function releaseSessionSlot(interviewId: string): Promise<void> {
  memorySlots.delete(interviewId);
  const redis = await getRedis();
  if (!redis) return;

  try {
    await redis.zrem("active-sessions", interviewId);
  } catch {
    // Best-effort
  }
}

/**
 * Get current active session count for monitoring.
 */
export async function getActiveSessionCount(): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;

  try {
    const now = Date.now();
    await redis.zremrangebyscore("active-sessions", 0, now - SESSION_TTL_MS);
    return await redis.zcard("active-sessions");
  } catch {
    return 0;
  }
}

/** Test hook (T11). */
export function resetSessionLimiterForTests(): void {
  memorySlots.clear();
  _redis = null;
}

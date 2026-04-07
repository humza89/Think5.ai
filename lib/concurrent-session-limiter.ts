/**
 * Concurrent Session Limiter — enforces maximum simultaneous interview sessions.
 *
 * Uses Redis sorted sets to track active sessions with automatic expiry.
 * Prevents resource exhaustion under load.
 */

import { logger } from "@/lib/logger";

const DEFAULT_MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_INTERVIEWS || "500", 10);
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — sessions auto-expire

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
  if (!redis) return true; // No Redis = allow (local dev)

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
    logger.error("[session-limiter] Redis error, allowing session", err as Record<string, unknown>);
    return true; // Fail-open to not block interviews
  }
}

/**
 * Release a session slot when an interview ends.
 */
export async function releaseSessionSlot(interviewId: string): Promise<void> {
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

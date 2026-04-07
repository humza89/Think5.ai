/**
 * Rate limiter with Redis-backed storage for distributed deployments.
 *
 * Uses Upstash Redis when available (production), falls back to in-memory
 * for local development.
 */

import { logger } from "@/lib/logger";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// ── Redis-backed rate limiter ──────────────────────────────────────────

let redisClient: { incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<unknown>; ttl: (key: string) => Promise<number> } | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      redisClient = new Redis({ url, token });
      return redisClient;
    } catch {
      // Fall through to in-memory
    }
  }

  return null;
}

// ── In-memory fallback (for local dev only) ────────────────────────────

const MAX_STORE_SIZE = 10000;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
      if (value.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000);
}

function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    if (rateLimitStore.size >= MAX_STORE_SIZE) {
      const keysToDelete: string[] = [];
      for (const [k, v] of rateLimitStore) {
        if (v.resetAt < now) keysToDelete.push(k);
        if (keysToDelete.length >= MAX_STORE_SIZE / 2) break;
      }
      if (keysToDelete.length === 0) {
        let count = 0;
        for (const k of rateLimitStore.keys()) {
          keysToDelete.push(k);
          count++;
          if (count >= MAX_STORE_SIZE / 10) break;
        }
      }
      for (const k of keysToDelete) rateLimitStore.delete(k);
    }

    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return {
    allowed: entry.count <= config.maxRequests,
    remaining,
    resetAt: entry.resetAt,
  };
}

// ── Public API ──────────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;
      const windowSeconds = Math.ceil(config.windowMs / 1000);

      const count = await redis.incr(redisKey);

      // Set TTL on first request in window
      if (count === 1) {
        await redis.expire(redisKey, windowSeconds);
      }

      const ttl = await redis.ttl(redisKey);
      const resetAt = Date.now() + ttl * 1000;
      const remaining = Math.max(0, config.maxRequests - count);

      return {
        allowed: count <= config.maxRequests,
        remaining,
        resetAt,
      };
    } catch (error) {
      logger.error("Redis rate limit error", { error });
      // In production, fail-closed if Redis is down to prevent bypass
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0, resetAt: Date.now() + config.windowMs };
      }
      return checkRateLimitInMemory(key, config);
    }
  }

  return checkRateLimitInMemory(key, config);
}

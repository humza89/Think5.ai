/**
 * Rate limiter with LRU eviction and configurable limits.
 *
 * In-memory implementation suitable for single-instance deployments.
 * For multi-replica production deployments, replace with Redis-backed
 * implementation (e.g., @upstash/ratelimit or ioredis sliding window).
 */

const MAX_STORE_SIZE = 10000; // Prevent unbounded memory growth
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
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

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // LRU eviction: if store is full, delete oldest entries
    if (rateLimitStore.size >= MAX_STORE_SIZE) {
      const keysToDelete: string[] = [];
      for (const [k, v] of rateLimitStore) {
        if (v.resetAt < now) keysToDelete.push(k);
        if (keysToDelete.length >= MAX_STORE_SIZE / 2) break;
      }
      // If no expired entries, just delete oldest 10%
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

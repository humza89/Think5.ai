/**
 * Generic cache layer using Upstash Redis.
 * Provides a simple get-or-fetch pattern with configurable TTL.
 */

let _cacheClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex: number }) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
} | null = null;

async function getCacheClient() {
  if (_cacheClient) return _cacheClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      _cacheClient = new Redis({ url, token }) as unknown as typeof _cacheClient;
      return _cacheClient;
    } catch {
      return null;
    }
  }

  return null;
}

// Stampede protection: coalesce concurrent requests for the same key
const pendingFetches = new Map<string, Promise<unknown>>();

/**
 * Get a value from cache, or fetch it and store it.
 * Includes stampede protection — concurrent requests for the same key
 * share a single fetch instead of all calling fetchFn simultaneously.
 *
 * @param key - Cache key
 * @param fetchFn - Function to call if cache miss
 * @param ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 */
export async function cacheGet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  const redis = await getCacheClient();

  if (redis) {
    try {
      const cached = await redis.get(`cache:${key}`);
      if (cached) {
        return JSON.parse(cached as string) as T;
      }
    } catch {
      // Cache miss or error — fall through to fetch
    }
  }

  // Stampede protection: if another request is already fetching this key, wait for it
  const cacheKey = `cache:${key}`;
  const inflight = pendingFetches.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const fetchPromise = fetchFn().then(async (value) => {
    pendingFetches.delete(cacheKey);

    if (redis && value !== null && value !== undefined) {
      try {
        await redis.set(cacheKey, JSON.stringify(value), { ex: ttlSeconds });
      } catch {
        // Non-blocking — cache write failure doesn't affect response
      }
    }

    return value;
  }).catch((err) => {
    pendingFetches.delete(cacheKey);
    throw err;
  });

  pendingFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Invalidate a cache key.
 */
export async function cacheInvalidate(key: string): Promise<void> {
  const redis = await getCacheClient();
  if (redis) {
    try {
      await redis.del(`cache:${key}`);
    } catch {
      // Best-effort
    }
  }
}

/**
 * Invalidate all keys matching a prefix pattern.
 * Note: Upstash doesn't support SCAN, so this is key-specific.
 */
export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  // For Upstash, we can't do prefix invalidation without SCAN.
  // Instead, callers should use specific cache keys and invalidate individually.
  // This is a placeholder for Redis instances that support SCAN.
  void prefix;
}

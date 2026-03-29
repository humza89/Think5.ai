/**
 * Session Store — Durable voice session state
 *
 * Uses Upstash Redis for serverless-compatible session persistence.
 * Falls back to in-memory Map if Redis is not configured.
 * Provides HMAC-signed reconnect token generation and validation.
 */

import { randomUUID, createHmac, createHash, timingSafeEqual } from "crypto";

// HMAC secret for signing reconnect tokens — falls back to random key for dev
const SESSION_HMAC_SECRET = process.env.SESSION_HMAC_SECRET || randomUUID();

// Redis client (lazy-initialized)
let redisClient: any = null;
let redisAvailable = false;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("Upstash Redis not configured. Using in-memory session fallback.");
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    redisAvailable = true;
    return redisClient;
  } catch {
    console.warn("Failed to initialize Redis client. Using in-memory fallback.");
    return null;
  }
}

// In-memory fallback with TTL support
const memoryStore = new Map<string, string>();
const memoryExpiry = new Map<string, number>();

const SESSION_TTL_SECONDS = 7200; // 2 hours

// Periodic sweep of expired in-memory sessions (every 60s)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of memoryExpiry) {
      if (now > expiresAt) {
        memoryStore.delete(key);
        memoryExpiry.delete(key);
      }
    }
  }, 60_000).unref?.();
}

export interface SessionState {
  interviewId: string;
  transcript: Array<{ role: string; text: string; timestamp: string }>;
  moduleScores: Array<{ module: string; score: number; reason: string }>;
  questionCount: number;
  reconnectToken: string;
  lastActiveAt: string;
  checkpointDigest: string;
  lastTurnIndex: number;
  reconnectCount: number;
}

function sessionKey(interviewId: string): string {
  return `voice-session:${interviewId}`;
}

/**
 * Save voice session state to durable store.
 */
export async function saveSessionState(
  interviewId: string,
  state: SessionState
): Promise<void> {
  const key = sessionKey(interviewId);
  const serialized = JSON.stringify(state);

  const redis = await getRedis();
  if (redis) {
    await redis.set(key, serialized, { ex: SESSION_TTL_SECONDS });
  } else {
    memoryStore.set(key, serialized);
    memoryExpiry.set(key, Date.now() + SESSION_TTL_SECONDS * 1000);
  }
}

/**
 * Retrieve voice session state from durable store.
 */
export async function getSessionState(
  interviewId: string
): Promise<SessionState | null> {
  const key = sessionKey(interviewId);

  const redis = await getRedis();
  if (redis) {
    const data = await redis.get(key);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data as SessionState;
  }

  const data = memoryStore.get(key);
  if (!data) return null;
  // Check TTL for in-memory entries
  const expiresAt = memoryExpiry.get(key);
  if (expiresAt && Date.now() > expiresAt) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    return null;
  }
  return JSON.parse(data);
}

/**
 * Delete voice session state from durable store.
 */
export async function deleteSessionState(
  interviewId: string
): Promise<void> {
  const key = sessionKey(interviewId);

  const redis = await getRedis();
  if (redis) {
    await redis.del(key);
  } else {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
  }
}

/**
 * Generate an HMAC-signed reconnect token for a voice session.
 * Format: `${timestamp}.${nonce}.${hmac}`
 * HMAC covers: `${interviewId}:${timestamp}:${nonce}`
 */
export function generateReconnectToken(interviewId: string): string {
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const hmac = createHmac("sha256", SESSION_HMAC_SECRET)
    .update(`${interviewId}:${timestamp}:${nonce}`)
    .digest("hex");
  return `${timestamp}.${nonce}.${hmac}`;
}

/**
 * Verify an HMAC-signed reconnect token without loading session state.
 * Checks: HMAC integrity, timestamp expiry (within SESSION_TTL_SECONDS).
 */
export function verifyReconnectToken(
  interviewId: string,
  token: string
): { valid: boolean; expired: boolean; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, expired: false, reason: "Malformed token" };
  }

  const [timestamp, nonce, providedHmac] = parts;
  const tokenAge = Date.now() - parseInt(timestamp, 10);

  if (isNaN(tokenAge)) {
    return { valid: false, expired: false, reason: "Invalid timestamp" };
  }

  if (tokenAge > SESSION_TTL_SECONDS * 1000) {
    return { valid: false, expired: true, reason: "Token expired" };
  }

  const expectedHmac = createHmac("sha256", SESSION_HMAC_SECRET)
    .update(`${interviewId}:${timestamp}:${nonce}`)
    .digest("hex");

  try {
    const valid = timingSafeEqual(
      Buffer.from(providedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );
    if (!valid) {
      return { valid: false, expired: false, reason: "Invalid signature" };
    }
  } catch {
    return { valid: false, expired: false, reason: "Invalid signature" };
  }

  return { valid: true, expired: false, reason: "OK" };
}

/**
 * Validate a reconnect token against stored session state.
 * Verifies HMAC signature, expiry, and session match.
 */
export async function validateReconnectToken(
  interviewId: string,
  token: string
): Promise<SessionState | null> {
  const verification = verifyReconnectToken(interviewId, token);
  if (!verification.valid) return null;

  const state = await getSessionState(interviewId);
  if (!state) return null;
  if (state.reconnectToken !== token) return null;
  return state;
}

/**
 * Compute SHA-256 checksum of a transcript for integrity verification.
 */
export function computeTranscriptChecksum(
  transcript: Array<{ role: string; text: string; timestamp: string }>
): string {
  const canonical = JSON.stringify(
    transcript.map((t) => ({ role: t.role, text: t.text, timestamp: t.timestamp }))
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Check if Redis is available for session storage.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Refresh the TTL on a session to prevent premature expiry during active use.
 * Should be called on each client poll to keep the session alive.
 */
export async function refreshSessionTTL(interviewId: string): Promise<void> {
  const key = sessionKey(interviewId);

  const redis = await getRedis();
  if (redis) {
    try {
      await redis.expire(key, SESSION_TTL_SECONDS);
    } catch (err) {
      console.warn(`[${interviewId}] Failed to refresh session TTL:`, err);
    }
  }
  // Refresh in-memory TTL
  if (memoryExpiry.has(key)) {
    memoryExpiry.set(key, Date.now() + SESSION_TTL_SECONDS * 1000);
  }
}

/**
 * Get session health diagnostics for monitoring.
 */
export async function getSessionHealth(interviewId: string): Promise<{
  exists: boolean;
  store: "redis" | "memory";
  lastActiveAt: string | null;
  ttlSeconds: number | null;
}> {
  const key = sessionKey(interviewId);
  const redis = await getRedis();

  if (redis) {
    const [data, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    const state = data
      ? (typeof data === "string" ? JSON.parse(data) : data) as SessionState
      : null;
    return {
      exists: !!data,
      store: "redis",
      lastActiveAt: state?.lastActiveAt || null,
      ttlSeconds: ttl > 0 ? ttl : null,
    };
  }

  const data = memoryStore.get(key);
  const state = data ? JSON.parse(data) as SessionState : null;
  return {
    exists: !!data,
    store: "memory",
    lastActiveAt: state?.lastActiveAt || null,
    ttlSeconds: null,
  };
}

/**
 * Attempt to restore session state from Redis when in-memory Map doesn't have it.
 * Returns the restored state or null if not found.
 */
export async function tryRestoreSession(
  interviewId: string
): Promise<SessionState | null> {
  const redis = await getRedis();
  if (!redis) return null;

  const key = sessionKey(interviewId);
  try {
    const data = await redis.get(key);
    if (!data) return null;
    const state = typeof data === "string" ? JSON.parse(data) : data as SessionState;
    console.log(`[${interviewId}] Session restored from Redis (last active: ${state.lastActiveAt})`);
    return state;
  } catch (err) {
    console.warn(`[${interviewId}] Failed to restore session from Redis:`, err);
    return null;
  }
}

/**
 * Record a heartbeat for an active voice session.
 * Used to detect stale sessions and monitor liveness.
 */
export async function recordHeartbeat(interviewId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(`voice-heartbeat:${interviewId}`, Date.now().toString(), { ex: 30 });
  }
}

/**
 * Check if a voice session is still alive (heartbeat within last 30s).
 */
export async function isSessionAlive(interviewId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  const val = await redis.get(`voice-heartbeat:${interviewId}`);
  return !!val;
}

/**
 * Acquire an exclusive session lock to prevent duplicate sessions.
 * Uses Redis SETNX with 60s TTL.
 */
export async function acquireSessionLock(interviewId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true; // Allow if Redis not available
  const key = `voice-lock:${interviewId}`;
  const result = await redis.set(key, Date.now().toString(), { nx: true, ex: 60 });
  return result === "OK";
}

/**
 * Release the session lock.
 */
export async function releaseSessionLock(interviewId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(`voice-lock:${interviewId}`);
}

/**
 * Refresh the session lock TTL (call during heartbeat).
 */
export async function refreshSessionLock(interviewId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.expire(`voice-lock:${interviewId}`, 60);
}

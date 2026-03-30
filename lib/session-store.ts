/**
 * Session Store — Durable voice session state
 *
 * Uses Upstash Redis for serverless-compatible session persistence.
 * Falls back to in-memory Map if Redis is not configured.
 * Provides HMAC-signed reconnect token generation and validation.
 */

import { randomUUID, createHmac, createHash, timingSafeEqual } from "crypto";

// HMAC secret for signing reconnect tokens — required in production
// Lazy-initialized to avoid crashing at build time (Next.js collects page data in production mode)
let _hmacSecret: string | null = null;
function getHmacSecret(): string {
  if (_hmacSecret) return _hmacSecret;
  _hmacSecret = process.env.SESSION_HMAC_SECRET || null;
  if (!_hmacSecret) {
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      console.error("[session-store] WARNING: SESSION_HMAC_SECRET not set in production — using random fallback");
    }
    _hmacSecret = randomUUID(); // Dev fallback; production should always set the env var
  }
  return _hmacSecret;
}

// Redis client (lazy-initialized)
let redisClient: any = null;
let redisAvailable = false;

const isProduction = process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (isProduction) {
      throw new Error("Redis unavailable in production — UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    }
    console.warn("Upstash Redis not configured. Using in-memory session fallback (dev/test only).");
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    redisAvailable = true;
    return redisClient;
  } catch (err) {
    if (isProduction) {
      throw new Error(`Redis initialization failed in production: ${err}`);
    }
    console.warn("Failed to initialize Redis client. Using in-memory fallback (dev/test only).");
    return null;
  }
}

/**
 * Assert that the durable store (Redis) is available.
 * Throws in production if Redis is not connected. No-op in dev/test.
 */
export async function assertDurableStore(): Promise<void> {
  if (!isProduction) return;
  const redis = await getRedis();
  if (!redis) {
    throw new Error("Redis unavailable in production — cannot proceed without durable session store");
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

export interface CandidateProfile {
  strengths: string[];
  weaknesses: string[];
  communicationStyle?: string;
  confidenceLevel?: "low" | "moderate" | "high";
  notableObservations?: string;
}

export interface SessionState {
  interviewId: string;
  moduleScores: Array<{ module: string; score: number; reason: string; sectionNotes?: string }>;
  questionCount: number;
  reconnectToken: string;
  lastActiveAt: string;
  checkpointDigest: string;
  lastTurnIndex: number;
  ledgerVersion: number;  // Alias for lastTurnIndex — latest turnIndex from canonical ledger
  stateHash: string;      // SHA-256 of interviewer state for reconciliation
  reconnectCount: number;
  // Enterprise memory fields — all optional for backward compatibility
  currentDifficultyLevel?: string;
  flaggedFollowUps?: Array<{ topic: string; reason: string; depth?: string }>;
  currentModule?: string;
  candidateProfile?: CandidateProfile;
  summarizedTurnCount?: number;
  lockOwnerToken?: string;
  askedQuestions?: string[];
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
  const sizeBytes = Buffer.byteLength(serialized, "utf8");

  // Session no longer stores transcript — canonical ledger in Postgres is authoritative.
  // Redis payload should stay well under 50KB (only pointers, scores, and enterprise memory).
  if (sizeBytes > 100_000) {
    console.warn(`[${interviewId}] Session state unexpectedly large (${Math.round(sizeBytes / 1024)}KB) — investigate payload contents`);
  }

  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(key, serialized, { ex: SESSION_TTL_SECONDS });
    } catch (err) {
      // Retry once after 500ms on Redis failure
      console.warn(`[${interviewId}] Session save failed, retrying in 500ms:`, err);
      await new Promise((r) => setTimeout(r, 500));
      try {
        await redis.set(key, serialized, { ex: SESSION_TTL_SECONDS });
      } catch (retryErr) {
        console.error(`[${interviewId}] Session save retry failed, falling back to memory:`, retryErr);
        memoryStore.set(key, serialized);
        memoryExpiry.set(key, Date.now() + SESSION_TTL_SECONDS * 1000);
      }
    }
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
  // Enforce TTL on every read (not just periodic sweep)
  const expiresAt = memoryExpiry.get(key);
  if (expiresAt && Date.now() > expiresAt) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    console.log(`[${interviewId}] In-memory session expired (TTL enforced on read)`);
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
 * HMAC covers: `${interviewId}:${timestamp}:${nonce}:${ledgerVersion}:${stateHash}`
 * Including ledger version and state hash ensures token invalidation on state change.
 */
export function generateReconnectToken(
  interviewId: string,
  ledgerVersion: number = -1,
  stateHash: string = ""
): string {
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const hmac = createHmac("sha256", getHmacSecret())
    .update(`${interviewId}:${timestamp}:${nonce}:${ledgerVersion}:${stateHash}`)
    .digest("hex");
  return `${timestamp}.${nonce}.${hmac}`;
}

/**
 * Verify an HMAC-signed reconnect token without loading session state.
 * Checks: HMAC integrity, timestamp expiry (within SESSION_TTL_SECONDS).
 * ledgerVersion and stateHash must match what was used to generate the token.
 */
export function verifyReconnectToken(
  interviewId: string,
  token: string,
  ledgerVersion: number = -1,
  stateHash: string = ""
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

  const expectedHmac = createHmac("sha256", getHmacSecret())
    .update(`${interviewId}:${timestamp}:${nonce}:${ledgerVersion}:${stateHash}`)
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
  transcript: Array<{ role: string; content: string; timestamp: string }>
): string {
  const canonical = JSON.stringify(
    transcript.map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp }))
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
    try {
      await redis.set(`voice-heartbeat:${interviewId}`, Date.now().toString(), { ex: 30 });
    } catch (err) {
      // H6/R5: Don't let heartbeat failures crash the request — log and continue
      console.warn(`[${interviewId}] Heartbeat record failed:`, err);
    }
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

// ── Session Lock (Owner-Token Based) ────────────────────────────────

const LOCK_TTL_SECONDS = 120; // 4x heartbeat interval (30s) for safety

// In-memory lock owner tracking (fallback when Redis unavailable)
const memoryLocks = new Map<string, string>();

/**
 * Acquire an exclusive session lock to prevent duplicate sessions.
 * Stores a unique owner token so only the lock holder can release/swap.
 * TTL: 120s, refreshed every 20s via heartbeat.
 */
export async function acquireSessionLock(
  interviewId: string,
  ownerToken?: string
): Promise<{ acquired: boolean; ownerToken: string }> {
  const token = ownerToken || randomUUID();
  const redis = await getRedis();

  if (!redis) {
    const key = `voice-lock:${interviewId}`;
    if (memoryLocks.has(key)) {
      return { acquired: false, ownerToken: "" };
    }
    memoryLocks.set(key, token);
    return { acquired: true, ownerToken: token };
  }

  const key = `voice-lock:${interviewId}`;
  const result = await redis.set(key, token, { nx: true, ex: LOCK_TTL_SECONDS });
  return { acquired: result === "OK", ownerToken: result === "OK" ? token : "" };
}

/**
 * Atomically swap the session lock owner (for reconnect).
 * Only succeeds if the current lock is held by `oldOwnerToken`.
 * This prevents the race condition where release+acquire is non-atomic.
 */
export async function swapSessionLock(
  interviewId: string,
  oldOwnerToken: string,
  newOwnerToken?: string
): Promise<{ acquired: boolean; ownerToken: string }> {
  const token = newOwnerToken || randomUUID();
  const redis = await getRedis();

  if (!redis) {
    const key = `voice-lock:${interviewId}`;
    const current = memoryLocks.get(key);
    if (current === oldOwnerToken || !current) {
      memoryLocks.set(key, token);
      return { acquired: true, ownerToken: token };
    }
    return { acquired: false, ownerToken: "" };
  }

  const key = `voice-lock:${interviewId}`;

  // Atomic compare-and-swap via Lua script
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    if current == ARGV[1] or current == false then
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
      return 1
    end
    return 0
  `;

  try {
    const result = await redis.eval(luaScript, [key], [oldOwnerToken, token, String(LOCK_TTL_SECONDS)]);
    const acquired = result === 1;
    return { acquired, ownerToken: acquired ? token : "" };
  } catch (err) {
    console.warn(`[${interviewId}] Lock swap failed, falling back to release+acquire:`, err);
    // Fallback: try release then acquire (less safe but functional)
    await releaseSessionLock(interviewId, oldOwnerToken);
    return acquireSessionLock(interviewId, token);
  }
}

/**
 * Release the session lock (only if held by owner).
 */
export async function releaseSessionLock(
  interviewId: string,
  ownerToken?: string
): Promise<void> {
  const redis = await getRedis();
  const key = `voice-lock:${interviewId}`;

  if (!redis) {
    if (!ownerToken || memoryLocks.get(key) === ownerToken) {
      memoryLocks.delete(key);
    }
    return;
  }

  if (ownerToken) {
    // Only release if we own it (Lua atomic check-and-delete)
    const luaScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    try {
      await redis.eval(luaScript, [key], [ownerToken]);
    } catch {
      // Fallback: unconditional delete
      await redis.del(key);
    }
  } else {
    await redis.del(key);
  }
}

/**
 * Refresh the session lock TTL (call during heartbeat).
 */
export async function refreshSessionLock(interviewId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.expire(`voice-lock:${interviewId}`, LOCK_TTL_SECONDS);
}

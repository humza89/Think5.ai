/**
 * Session Store — Durable voice session state
 *
 * Uses Upstash Redis for serverless-compatible session persistence.
 * Falls back to in-memory Map if Redis is not configured.
 * Provides HMAC-signed reconnect token generation and validation.
 */

import { randomUUID, createHmac, createHash, timingSafeEqual } from "crypto";
import { recordSLOEvent } from "@/lib/slo-monitor";

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

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE;
}

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (isProduction()) {
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
    if (isProduction()) {
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
  interviewerState?: string; // Serialized InterviewerState JSON for deterministic continuity
  violationCount?: number;
  memoryPacketVersion?: number;
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
    console.warn(JSON.stringify({ event: "session_state_oversized", interviewId, sizeKB: Math.round(sizeBytes / 1024), severity: "warning", timestamp: new Date().toISOString() }));
  }

  const redis = await getRedis();
  if (redis) {
    const maxRetries = parseInt(process.env.SESSION_RETRY_COUNT || "3", 10);
    const retryBaseMs = parseInt(process.env.SESSION_RETRY_BASE_MS || "100", 10);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await redis.set(key, serialized, { ex: SESSION_TTL_SECONDS });
        return; // Success — exit early
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          const delay = retryBaseMs * Math.pow(3, attempt); // 100, 300, 900ms
          console.warn(JSON.stringify({ event: "session_save_retry", interviewId, attempt: attempt + 1, maxAttempts: maxRetries + 1, delayMs: delay, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // All retries exhausted
    if (isProduction()) {
      console.error(JSON.stringify({
        event: "SESSION_PERSIST_FAILURE",
        interviewId,
        attempts: maxRetries + 1,
        severity: "critical",
        error: (lastErr as Error)?.message || "unknown",
        timestamp: new Date().toISOString(),
      }));
      recordSLOEvent("session.save.failure_rate", false).catch(() => {});
      throw new Error(`Session save failed for ${interviewId} — Redis write failure after ${maxRetries + 1} attempts`);
    }
    console.error(JSON.stringify({ event: "session_save_fallback", interviewId, attempts: maxRetries + 1, error: (lastErr as Error)?.message, severity: "error", timestamp: new Date().toISOString() }));
    memoryStore.set(key, serialized);
    memoryExpiry.set(key, Date.now() + SESSION_TTL_SECONDS * 1000);
  } else {
    if (isProduction()) {
      console.error(JSON.stringify({
        event: "SESSION_PERSIST_FAILURE",
        interviewId,
        attempts: 0,
        severity: "critical",
        error: "no durable store available",
        timestamp: new Date().toISOString(),
      }));
      throw new Error(`Session save failed for ${interviewId} — no durable store available`);
    }
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
    const maxRetries = parseInt(process.env.SESSION_RETRY_COUNT || "3", 10);
    const retryBaseMs = parseInt(process.env.SESSION_RETRY_BASE_MS || "100", 10);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await redis.get(key);
        if (!data) return null;
        return typeof data === "string" ? JSON.parse(data) : data as SessionState;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          const delay = retryBaseMs * Math.pow(3, attempt);
          console.warn(JSON.stringify({ event: "session_read_retry", interviewId, attempt: attempt + 1, maxAttempts: maxRetries + 1, delayMs: delay, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // All read retries exhausted — log but don't throw (read path falls through to memory)
    console.error(JSON.stringify({ event: "session_read_failure", interviewId, attempts: maxRetries + 1, error: (lastErr as Error)?.message, severity: "error", timestamp: new Date().toISOString() }));
    if (isProduction()) {
      recordSLOEvent("session.read.failure_rate", false).catch(() => {});
    }
  }

  const data = memoryStore.get(key);
  if (!data) return null;
  // Enforce TTL on every read (not just periodic sweep)
  const expiresAt = memoryExpiry.get(key);
  if (expiresAt && Date.now() > expiresAt) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    console.log(JSON.stringify({ event: "session_memory_expired", interviewId, severity: "info", timestamp: new Date().toISOString() }));
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
      console.warn(JSON.stringify({ event: "session_ttl_refresh_failure", interviewId, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
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
    console.log(JSON.stringify({ event: "session_restored", interviewId, lastActiveAt: state.lastActiveAt, severity: "info", timestamp: new Date().toISOString() }));
    return state;
  } catch (err) {
    console.warn(JSON.stringify({ event: "session_restore_failure", interviewId, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
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
      console.warn(JSON.stringify({ event: "heartbeat_record_failure", interviewId, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
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

const LOCK_TTL_SECONDS = 90; // 3x heartbeat interval (30s) — tighter to reduce stale session risk

// In-memory lock owner tracking (fallback when Redis unavailable)
const memoryLocks = new Map<string, string>();

/**
 * Acquire an exclusive session lock to prevent duplicate sessions.
 * Stores a unique owner token so only the lock holder can release/swap.
 * TTL: 90s (3x heartbeat interval), refreshed every 30s via heartbeat.
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
    console.warn(JSON.stringify({ event: "lock_swap_failure", interviewId, error: (err as Error)?.message, severity: "warning", timestamp: new Date().toISOString() }));
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

// ── Session Reconstruction from Canonical Ledger ─────────────────────

/**
 * Reconstruct a SessionState from the canonical conversation ledger and
 * Postgres snapshots when Redis session is lost (e.g., Redis outage).
 *
 * Returns null if the interview has no ledger data (nothing to reconstruct from).
 */
export async function reconstructSessionFromLedger(
  interviewId: string
): Promise<SessionState | null> {
  try {
    const { getLedgerSnapshot, getFullTranscript } = await import("@/lib/conversation-ledger");
    const { computeStateHash, createInitialState, serializeState, deserializeState } = await import("@/lib/interviewer-state");
    const { prisma } = await import("@/lib/prisma");

    // 1. Get ledger snapshot for version info
    const snapshot = await getLedgerSnapshot(interviewId);
    if (snapshot.turnCount === 0) return null;

    // 2. Try to load InterviewerState from latest snapshot in Postgres
    let interviewerStateJson: string | undefined;
    let stateHash = "";
    try {
      const stateSnapshot = await prisma.interviewerStateSnapshot.findFirst({
        where: { interviewId },
        orderBy: { turnIndex: "desc" },
        select: { stateJson: true },
      });
      if (stateSnapshot?.stateJson) {
        const parsed = typeof stateSnapshot.stateJson === "string"
          ? stateSnapshot.stateJson
          : JSON.stringify(stateSnapshot.stateJson);
        const iState = deserializeState(parsed);
        interviewerStateJson = serializeState(iState);
        stateHash = computeStateHash(iState);
      }
    } catch {
      // Fall back to fresh state
    }

    if (!interviewerStateJson) {
      const fresh = createInitialState();
      interviewerStateJson = serializeState(fresh);
      stateHash = fresh.stateHash;
    }

    // 3. Count questions from transcript
    const transcript = await getFullTranscript(interviewId);
    let questionCount = 0;
    for (let i = 1; i < transcript.length; i++) {
      if (
        (transcript[i].role === "assistant" || transcript[i].role === "model") &&
        (transcript[i - 1].role === "candidate" || transcript[i - 1].role === "user")
      ) {
        questionCount++;
      }
    }

    // 4. Fetch module scores from interview record
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { skillModuleScores: true },
    });
    const moduleScores = Array.isArray(interview?.skillModuleScores)
      ? (interview.skillModuleScores as Array<{ module: string; score: number; reason: string }>)
      : [];

    // 5. Generate fresh reconnect token
    const reconnectToken = generateReconnectToken(interviewId, snapshot.latestTurnIndex, stateHash);

    // 6. Compose reconstructed session
    const reconstructed: SessionState = {
      interviewId,
      moduleScores,
      questionCount,
      reconnectToken,
      lastActiveAt: new Date().toISOString(),
      checkpointDigest: snapshot.checksum,
      lastTurnIndex: snapshot.latestTurnIndex,
      ledgerVersion: snapshot.latestTurnIndex,
      stateHash,
      reconnectCount: 0,
      interviewerState: interviewerStateJson,
    };

    console.log(JSON.stringify({ event: "session_reconstructed", interviewId, turnCount: snapshot.turnCount, questionCount, severity: "info", timestamp: new Date().toISOString() }));
    return reconstructed;
  } catch (err) {
    console.error(JSON.stringify({ event: "session_reconstruction_failure", interviewId, error: (err as Error)?.message, severity: "error", timestamp: new Date().toISOString() }));
    return null;
  }
}

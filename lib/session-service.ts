/**
 * SessionService — single source of truth for voice interview lifecycle state.
 *
 * Phase 2.1 of the voice-reliability hardening plan.
 *
 * Before this module existed, lifecycle state was split across:
 *   - client refs in hooks/useVoiceInterview.ts (aiStateRef, reconnectAttemptsRef)
 *   - relay in-process state in relay/server.ts (clientAlive, geminiAlive, isReconnecting)
 *   - lib/session-store.ts SessionState (checkpoints only — no lifecycle enum)
 *
 * These three views diverged during reconnects, producing inconsistent behavior:
 * the relay would hard-kill a session the client still believed was active, the
 * cron pause-timeout would fight with an in-flight reconnect, etc.
 *
 * SessionService centralizes lifecycle into a single state machine backed by
 * Redis (same store as session-store.ts, different key prefix). All writers
 * (relay, API routes, cron) go through transition() with a CAS guard so
 * conflicting updates are rejected rather than silently overwriting.
 *
 * **This module does NOT replace session-store.ts** — that module owns the
 * heavy state (module scores, interviewer state, transcript digest). This
 * module owns ONLY the lifecycle enum and its audit trail.
 */

import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * The six legal lifecycle states a voice interview can occupy.
 *
 *   pending      — interview created, candidate has not joined the room yet
 *   active       — candidate is connected and audio is flowing in at least one direction
 *   reconnecting — transient: client or relay is retrying a dropped connection
 *   paused       — candidate explicitly paused; cron will cancel after PAUSE_TIMEOUT_MS
 *   completed    — candidate finished the interview normally (success path)
 *   failed       — terminal error: reconnect budget exhausted, provider unavailable,
 *                  pause timeout, explicit cancellation, etc.
 *
 * Terminal states (`completed`, `failed`) cannot be transitioned out of.
 */
export type SessionLifecycleState =
  | "pending"
  | "active"
  | "reconnecting"
  | "paused"
  | "completed"
  | "failed";

export interface SessionLifecycleRecord {
  interviewId: string;
  state: SessionLifecycleState;
  /** ISO timestamp of the most recent state change. */
  updatedAt: string;
  /** ISO timestamp of the most recent heartbeat (any source: relay ping, client frame). */
  lastSeenAt: string;
  /** Opaque per-connection owner token, used by relay for CAS during reconnect. */
  ownerToken: string;
  /** Human-readable reason attached to the most recent transition (for debugging). */
  reason: string;
  /** Ring-buffered history of the last N transitions, newest last. */
  history: SessionTransitionRecord[];
}

export interface SessionTransitionRecord {
  from: SessionLifecycleState;
  to: SessionLifecycleState;
  reason: string;
  at: string;
}

export interface TransitionResult {
  ok: boolean;
  /** The record AFTER the transition (on success) or the current record (on failure). */
  record: SessionLifecycleRecord;
  /** On failure, describes why the CAS rejected the transition. */
  rejection?: "stale_from" | "terminal" | "illegal" | "not_found" | "storage_error";
}

// ── State machine definition ──────────────────────────────────────────

/**
 * Legal transition map. Any (from, to) pair not listed here is rejected by
 * `transition()` with rejection="illegal". Keep this table small and explicit:
 * the fewer edges we allow, the fewer weird intermediate states we have to
 * reason about in production.
 */
const LEGAL_TRANSITIONS: Record<SessionLifecycleState, readonly SessionLifecycleState[]> = {
  pending: ["active", "failed"],
  active: ["reconnecting", "paused", "completed", "failed"],
  reconnecting: ["active", "failed"],
  paused: ["active", "failed"],
  // Terminal: no outgoing edges.
  completed: [],
  failed: [],
};

const TERMINAL_STATES: ReadonlySet<SessionLifecycleState> = new Set(["completed", "failed"]);

const MAX_HISTORY_ENTRIES = 20;
const LIFECYCLE_TTL_SECONDS = 7200; // 2h, same as session-store

export function isTerminalState(state: SessionLifecycleState): boolean {
  return TERMINAL_STATES.has(state);
}

export function isLegalTransition(
  from: SessionLifecycleState,
  to: SessionLifecycleState,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

// ── Storage layer ──────────────────────────────────────────────────────

/**
 * SessionService uses a tiny storage abstraction so we can inject an
 * in-memory backend for unit tests without pulling in the whole
 * session-store.ts Redis harness.
 */
export interface LifecycleStore {
  get(interviewId: string): Promise<SessionLifecycleRecord | null>;
  /**
   * Compare-and-set: only write if `expectedUpdatedAt` matches the value
   * currently in the store (or null means "only if the row doesn't exist yet").
   * Returns true if the write happened, false if the CAS failed.
   */
  cas(
    interviewId: string,
    expectedUpdatedAt: string | null,
    next: SessionLifecycleRecord,
  ): Promise<boolean>;
}

// Default Redis-backed store — intentionally lightweight and
// lazy-initialized so tests don't pay the import cost.
let _defaultStore: LifecycleStore | null = null;

export function getDefaultStore(): LifecycleStore {
  if (_defaultStore) return _defaultStore;
  _defaultStore = new RedisLifecycleStore();
  return _defaultStore;
}

/** For tests — inject a fresh store and forget the default. */
export function __setDefaultStoreForTests(store: LifecycleStore | null): void {
  _defaultStore = store;
}

class RedisLifecycleStore implements LifecycleStore {
  private async redis() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    const { Redis } = await import("@upstash/redis");
    return new Redis({ url, token });
  }

  private key(interviewId: string): string {
    return `voice-lifecycle:${interviewId}`;
  }

  async get(interviewId: string): Promise<SessionLifecycleRecord | null> {
    const redis = await this.redis();
    if (!redis) return null;
    const raw = await redis.get(this.key(interviewId));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as SessionLifecycleRecord);
  }

  async cas(
    interviewId: string,
    expectedUpdatedAt: string | null,
    next: SessionLifecycleRecord,
  ): Promise<boolean> {
    const redis = await this.redis();
    if (!redis) return false;
    const key = this.key(interviewId);
    const payload = JSON.stringify(next);

    // Lua CAS: either the row doesn't exist and expectedUpdatedAt is null,
    // or the row exists and its updatedAt matches what the caller observed.
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if ARGV[2] == '' and current == false then
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
        return 1
      end
      if current == false then
        return 0
      end
      local ok, parsed = pcall(cjson.decode, current)
      if ok and parsed.updatedAt == ARGV[2] then
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
        return 1
      end
      return 0
    `;
    try {
      const result = await redis.eval(
        luaScript,
        [key],
        [payload, expectedUpdatedAt ?? "", String(LIFECYCLE_TTL_SECONDS)],
      );
      return result === 1;
    } catch (err) {
      logger.warn(
        JSON.stringify({
          event: "session_lifecycle_cas_failure",
          interviewId,
          error: (err as Error)?.message,
          severity: "warning",
          timestamp: new Date().toISOString(),
        }),
      );
      return false;
    }
  }
}

/**
 * In-memory store for unit tests. Thread-safe enough for single-threaded
 * vitest workers; not intended for production use.
 */
export class InMemoryLifecycleStore implements LifecycleStore {
  private records = new Map<string, SessionLifecycleRecord>();

  async get(interviewId: string): Promise<SessionLifecycleRecord | null> {
    return this.records.get(interviewId) ?? null;
  }

  async cas(
    interviewId: string,
    expectedUpdatedAt: string | null,
    next: SessionLifecycleRecord,
  ): Promise<boolean> {
    const existing = this.records.get(interviewId) ?? null;
    if (expectedUpdatedAt === null) {
      if (existing !== null) return false;
    } else {
      if (existing === null || existing.updatedAt !== expectedUpdatedAt) return false;
    }
    this.records.set(interviewId, next);
    return true;
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export interface CreateSessionInput {
  interviewId: string;
  ownerToken?: string;
  reason?: string;
  store?: LifecycleStore;
  now?: () => Date;
}

/**
 * Create a new lifecycle record in the `pending` state. Idempotent in the
 * sense that calling it twice for the same interviewId will return the existing
 * record instead of overwriting — callers should check `result.record.state`.
 */
export async function createSession(input: CreateSessionInput): Promise<TransitionResult> {
  const store = input.store ?? getDefaultStore();
  const now = (input.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const existing = await store.get(input.interviewId);
  if (existing) {
    return { ok: false, record: existing, rejection: "stale_from" };
  }

  const record: SessionLifecycleRecord = {
    interviewId: input.interviewId,
    state: "pending",
    updatedAt: nowIso,
    lastSeenAt: nowIso,
    ownerToken: input.ownerToken ?? randomUUID(),
    reason: input.reason ?? "session_created",
    history: [],
  };

  const written = await store.cas(input.interviewId, null, record);
  if (!written) {
    // Someone raced us — fetch whatever they wrote and report as stale.
    const refetched = (await store.get(input.interviewId)) ?? record;
    return { ok: false, record: refetched, rejection: "stale_from" };
  }
  return { ok: true, record };
}

export interface TransitionInput {
  interviewId: string;
  expectedFrom: SessionLifecycleState;
  to: SessionLifecycleState;
  reason: string;
  store?: LifecycleStore;
  now?: () => Date;
}

/**
 * CAS transition from `expectedFrom` to `to`. The transition is rejected if:
 *   - no record exists (rejection="not_found")
 *   - the current state is terminal (rejection="terminal")
 *   - the (from, to) pair is not in LEGAL_TRANSITIONS (rejection="illegal")
 *   - the current state != expectedFrom, i.e. someone else wrote since the
 *     caller last read (rejection="stale_from")
 *   - the underlying store write failed (rejection="storage_error")
 *
 * On success, the record is updated with the new state, updatedAt, lastSeenAt,
 * reason, and a new entry appended to the transition history.
 */
export async function transition(input: TransitionInput): Promise<TransitionResult> {
  const store = input.store ?? getDefaultStore();
  const now = (input.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const current = await store.get(input.interviewId);
  if (!current) {
    return {
      ok: false,
      record: makeSyntheticMissingRecord(input.interviewId, nowIso),
      rejection: "not_found",
    };
  }

  if (isTerminalState(current.state)) {
    return { ok: false, record: current, rejection: "terminal" };
  }

  if (current.state !== input.expectedFrom) {
    return { ok: false, record: current, rejection: "stale_from" };
  }

  if (!isLegalTransition(input.expectedFrom, input.to)) {
    return { ok: false, record: current, rejection: "illegal" };
  }

  const newHistory = [
    ...current.history,
    {
      from: current.state,
      to: input.to,
      reason: input.reason,
      at: nowIso,
    },
  ].slice(-MAX_HISTORY_ENTRIES);

  const next: SessionLifecycleRecord = {
    ...current,
    state: input.to,
    updatedAt: nowIso,
    lastSeenAt: nowIso,
    reason: input.reason,
    history: newHistory,
  };

  const written = await store.cas(input.interviewId, current.updatedAt, next);
  if (!written) {
    const refetched = (await store.get(input.interviewId)) ?? current;
    return { ok: false, record: refetched, rejection: "stale_from" };
  }

  logger.info(
    JSON.stringify({
      event: "session_lifecycle_transition",
      interviewId: input.interviewId,
      from: input.expectedFrom,
      to: input.to,
      reason: input.reason,
      severity: "info",
      timestamp: nowIso,
    }),
  );

  return { ok: true, record: next };
}

export interface HeartbeatInput {
  interviewId: string;
  store?: LifecycleStore;
  now?: () => Date;
}

/**
 * Update the `lastSeenAt` timestamp without changing state. Used by the relay
 * on every bidirectional frame and by the client voice-init polling endpoint.
 *
 * Unlike `transition()`, this does NOT advance updatedAt, so concurrent
 * heartbeats don't invalidate other writers' CAS reads. Implemented as an
 * unconditional write (last heartbeat wins) — it's a monotonically increasing
 * field so ordering races are benign.
 */
export async function heartbeat(input: HeartbeatInput): Promise<TransitionResult> {
  const store = input.store ?? getDefaultStore();
  const now = (input.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const current = await store.get(input.interviewId);
  if (!current) {
    return {
      ok: false,
      record: makeSyntheticMissingRecord(input.interviewId, nowIso),
      rejection: "not_found",
    };
  }
  if (isTerminalState(current.state)) {
    return { ok: false, record: current, rejection: "terminal" };
  }

  const next: SessionLifecycleRecord = { ...current, lastSeenAt: nowIso };
  // Unconditional write — we don't gate on updatedAt because heartbeat is
  // monotonic and overlapping writes are fine. In practice we use a no-op
  // CAS pattern (expected = current.updatedAt) so we don't stomp on a
  // concurrent state transition.
  const written = await store.cas(input.interviewId, current.updatedAt, next);
  if (!written) {
    // A real transition happened between our get() and our cas() — that's fine,
    // the transition already updated lastSeenAt. Report success with refetched.
    const refetched = (await store.get(input.interviewId)) ?? current;
    return { ok: true, record: refetched };
  }
  return { ok: true, record: next };
}

export async function getSession(
  interviewId: string,
  store: LifecycleStore = getDefaultStore(),
): Promise<SessionLifecycleRecord | null> {
  return store.get(interviewId);
}

// ── Internals ─────────────────────────────────────────────────────────

function makeSyntheticMissingRecord(
  interviewId: string,
  nowIso: string,
): SessionLifecycleRecord {
  return {
    interviewId,
    state: "pending",
    updatedAt: nowIso,
    lastSeenAt: nowIso,
    ownerToken: "",
    reason: "not_found_synthetic",
    history: [],
  };
}

/**
 * InterviewSessionStore contract (T0.5; T11 wraps the existing Redis
 * `lib/session-store.ts` and the Postgres `InterviewerStateSnapshot` table).
 *
 * This is the authoritative-state boundary from PRD v2.1 §10.1B:
 *
 * - Postgres is authoritative. Redis is an accelerator for hot state and
 *   leases. Every write reports `Durability` so callers can see whether the
 *   accelerator participated.
 * - Losing Redis is a durability *downgrade* ("postgres" instead of
 *   "postgres+redis"), never state loss and never a failed write.
 * - A checkpoint is immutable once written; a later checkpoint has a higher
 *   `turnIndex`. `loadLatest` returns the highest one.
 * - Leases fence writers: only the holder of an unexpired lease may drive an
 *   interview. Lease bookkeeping may live in Redis, but a lease decision must
 *   remain correct (fail-closed for a second owner) when Redis is unavailable.
 */

export type Durability = "postgres" | "postgres+redis";

export interface SessionCheckpoint {
  interviewId: string;
  /** Ledger turn index the state corresponds to; strictly increasing. */
  turnIndex: number;
  /** Serialisable interviewer state. Stored as JSON text. */
  state: unknown;
  /** SHA-256 (hex) of the serialised state, for reconciliation. */
  stateHash: string;
  /** ISO-8601, assigned by the store. */
  createdAt: string;
}

export type NewCheckpoint = Omit<SessionCheckpoint, "createdAt">;

export interface WriteResult {
  durability: Durability;
}

export interface Lease {
  interviewId: string;
  ownerId: string;
  /** Opaque fencing token; must be presented to renew or release. */
  token: string;
  /** ISO-8601 expiry. */
  expiresAt: string;
}

export interface LeaseResult extends WriteResult {
  acquired: boolean;
  lease?: Lease;
  /** Present when `acquired` is false: who currently holds the lease. */
  heldBy?: string;
}

export interface RenewResult extends WriteResult {
  renewed: boolean;
  lease?: Lease;
}

export interface ReleaseResult extends WriteResult {
  released: boolean;
}

export interface InterviewSessionStore {
  saveCheckpoint(checkpoint: NewCheckpoint): Promise<WriteResult & { turnIndex: number }>;
  loadLatest(interviewId: string): Promise<SessionCheckpoint | null>;
  lease(interviewId: string, ownerId: string, ttlMs: number): Promise<LeaseResult>;
  renewLease(lease: Lease, ttlMs: number): Promise<RenewResult>;
  release(lease: Lease): Promise<ReleaseResult>;
}

export interface InMemorySessionStoreOptions {
  /** Simulates the Redis accelerator being reachable. Toggle at runtime. */
  redisAvailable?: boolean;
  /** Injectable clock for deterministic lease expiry in tests. */
  now?: () => number;
}

/**
 * Reference implementation: a "postgres" map that is always written and a
 * "redis" map that is only touched while `redisAvailable` is true. It exists
 * to pin the contract's semantics in the conformance harness.
 */
export class InMemoryInterviewSessionStore implements InterviewSessionStore {
  redisAvailable: boolean;
  private readonly now: () => number;
  private readonly postgres = new Map<string, SessionCheckpoint[]>();
  private readonly redisHot = new Map<string, SessionCheckpoint>();
  private readonly leases = new Map<string, Lease>();
  private tokenSeq = 0;

  constructor(options: InMemorySessionStoreOptions = {}) {
    this.redisAvailable = options.redisAvailable ?? true;
    this.now = options.now ?? (() => Date.now());
  }

  private durability(): Durability {
    return this.redisAvailable ? "postgres+redis" : "postgres";
  }

  async saveCheckpoint(checkpoint: NewCheckpoint): Promise<WriteResult & { turnIndex: number }> {
    if (!checkpoint.interviewId) throw new Error("saveCheckpoint requires interviewId");
    if (!Number.isInteger(checkpoint.turnIndex) || checkpoint.turnIndex < 0) {
      throw new Error("saveCheckpoint requires a non-negative integer turnIndex");
    }
    if (!checkpoint.stateHash) throw new Error("saveCheckpoint requires stateHash");

    const history = this.postgres.get(checkpoint.interviewId) ?? [];
    if (history.some((c) => c.turnIndex === checkpoint.turnIndex)) {
      throw new Error(`Checkpoint for turn ${checkpoint.turnIndex} already exists; checkpoints are immutable`);
    }
    const stored: SessionCheckpoint = Object.freeze({
      ...checkpoint,
      state: JSON.parse(JSON.stringify(checkpoint.state ?? null)),
      createdAt: new Date(this.now()).toISOString(),
    });
    history.push(stored);
    this.postgres.set(checkpoint.interviewId, history);
    // The hot copy must always be the highest turn, not the last write.
    const hot = this.redisHot.get(checkpoint.interviewId);
    if (this.redisAvailable && (!hot || stored.turnIndex > hot.turnIndex)) {
      this.redisHot.set(checkpoint.interviewId, stored);
    }
    return { durability: this.durability(), turnIndex: stored.turnIndex };
  }

  async loadLatest(interviewId: string): Promise<SessionCheckpoint | null> {
    if (this.redisAvailable) {
      const hot = this.redisHot.get(interviewId);
      if (hot) return hot;
    }
    const history = this.postgres.get(interviewId);
    if (!history || history.length === 0) return null;
    return history.reduce((latest, c) => (c.turnIndex > latest.turnIndex ? c : latest));
  }

  private activeLease(interviewId: string): Lease | undefined {
    const lease = this.leases.get(interviewId);
    if (!lease) return undefined;
    if (Date.parse(lease.expiresAt) <= this.now()) {
      this.leases.delete(interviewId);
      return undefined;
    }
    return lease;
  }

  async lease(interviewId: string, ownerId: string, ttlMs: number): Promise<LeaseResult> {
    if (!(ttlMs > 0)) throw new Error("lease requires ttlMs > 0");
    const current = this.activeLease(interviewId);
    if (current && current.ownerId !== ownerId) {
      return { acquired: false, heldBy: current.ownerId, durability: this.durability() };
    }
    const lease: Lease = {
      interviewId,
      ownerId,
      token: `lease-${++this.tokenSeq}`,
      expiresAt: new Date(this.now() + ttlMs).toISOString(),
    };
    this.leases.set(interviewId, lease);
    return { acquired: true, lease, durability: this.durability() };
  }

  async renewLease(lease: Lease, ttlMs: number): Promise<RenewResult> {
    if (!(ttlMs > 0)) throw new Error("renewLease requires ttlMs > 0");
    const current = this.activeLease(lease.interviewId);
    if (!current || current.token !== lease.token) {
      return { renewed: false, durability: this.durability() };
    }
    const renewed: Lease = { ...current, expiresAt: new Date(this.now() + ttlMs).toISOString() };
    this.leases.set(lease.interviewId, renewed);
    return { renewed: true, lease: renewed, durability: this.durability() };
  }

  async release(lease: Lease): Promise<ReleaseResult> {
    const current = this.activeLease(lease.interviewId);
    if (!current || current.token !== lease.token) {
      return { released: false, durability: this.durability() };
    }
    this.leases.delete(lease.interviewId);
    return { released: true, durability: this.durability() };
  }
}

/**
 * PrismaRedisInterviewSessionStore (Phase 0 T11) — the production
 * implementation of the T0.5 `InterviewSessionStore` contract.
 *
 * - Checkpoints are rows in `InterviewerStateSnapshot` (Postgres, authoritative,
 *   immutable per (interviewId, turnIndex)). Redis holds a best-effort hot copy
 *   of the highest checkpoint so `loadLatest` avoids a query on the happy path.
 * - Leases are rows in `InterviewLease` (Postgres), fenced by an opaque token,
 *   so a second owner is refused even while Redis is down. Redis is never used
 *   for a lease decision.
 * - Every write reports `durability`: "postgres+redis" when the accelerator
 *   participated, "postgres" when it was unavailable or failed. Losing Redis is
 *   never a failed write.
 *
 * Existing voice routes still use the legacy `lib/session-store.ts` functions;
 * new code takes this class through the contract. The legacy module is being
 * made safe-to-fail in the same task so both agree on the durability semantics.
 */
import { randomUUID } from "crypto";
import type {
  Durability,
  InterviewSessionStore,
  Lease,
  LeaseResult,
  NewCheckpoint,
  ReleaseResult,
  RenewResult,
  SessionCheckpoint,
  WriteResult,
} from "@/lib/contracts/interview-session-store";
import type { Telemetry } from "@/lib/contracts/telemetry";
import { NoopTelemetry } from "@/lib/contracts/telemetry";
import { noteRedisDegraded, withRedisTimeout, REDIS_CALL_TIMEOUT_MS } from "@/lib/redis-degradation";

export interface SnapshotRow {
  interviewId: string;
  turnIndex: number;
  stateJson: string;
  stateHash: string;
  createdAt: Date;
}

export interface LeaseRow {
  interviewId: string;
  ownerId: string;
  token: string;
  expiresAt: Date;
}

/** Narrow view of the Prisma client used by the store (also implemented in-memory by tests). */
export interface SessionStoreDb {
  interviewerStateSnapshot: {
    create(args: { data: Omit<SnapshotRow, "createdAt"> }): Promise<SnapshotRow>;
    findFirst(args: { where: { interviewId: string }; orderBy: { turnIndex: "desc" } }): Promise<SnapshotRow | null>;
  };
  interviewLease: {
    findUnique(args: { where: { interviewId: string } }): Promise<LeaseRow | null>;
    create(args: { data: LeaseRow }): Promise<LeaseRow>;
    updateMany(args: {
      where: { interviewId: string; token?: string; ownerId?: string; expiresAt?: { lte?: Date; gt?: Date }; OR?: Array<{ expiresAt?: { lte: Date }; ownerId?: string }> };
      data: Partial<Omit<LeaseRow, "interviewId">>;
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { interviewId: string; token: string } }): Promise<{ count: number }>;
  };
}

export interface SessionStoreRedis {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
}

export interface PrismaRedisSessionStoreOptions {
  db: SessionStoreDb;
  /** Returns the accelerator, or null when not configured. Errors are treated as unavailable. */
  redis?: () => Promise<SessionStoreRedis | null>;
  telemetry?: Telemetry;
  now?: () => number;
  hotTtlSeconds?: number;
}

const HOT_KEY_PREFIX = "voice-checkpoint:";
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export class PrismaRedisInterviewSessionStore implements InterviewSessionStore {
  private readonly db: SessionStoreDb;
  private readonly redis: () => Promise<SessionStoreRedis | null>;
  private readonly telemetry: Telemetry;
  private readonly now: () => number;
  private readonly hotTtlSeconds: number;
  /** Last observed accelerator state; drives the durability reported by lease operations. */
  private acceleratorHealthy = true;
  private acceleratorEnabled = true;

  constructor(options: PrismaRedisSessionStoreOptions) {
    this.db = options.db;
    this.redis = options.redis ?? (async () => null);
    this.telemetry = options.telemetry ?? new NoopTelemetry();
    this.now = options.now ?? (() => Date.now());
    this.hotTtlSeconds = options.hotTtlSeconds ?? 7200;
  }

  /** Test/ops hook: pretend the accelerator is gone (conformance harness `disableAccelerator`). */
  setAcceleratorEnabled(enabled: boolean): void {
    this.acceleratorEnabled = enabled;
    if (!enabled) this.acceleratorHealthy = false;
  }

  private durability(): Durability {
    return this.acceleratorEnabled && this.acceleratorHealthy ? "postgres+redis" : "postgres";
  }

  private async accelerator(): Promise<SessionStoreRedis | null> {
    if (!this.acceleratorEnabled) return null;
    try {
      const client = await this.redis();
      if (!client) this.acceleratorHealthy = false; // not configured: durability is postgres
      return client;
    } catch (err) {
      this.acceleratorHealthy = false;
      noteRedisDegraded("session-store-adapter", err);
      return null;
    }
  }

  private toCheckpoint(row: SnapshotRow): SessionCheckpoint {
    return {
      interviewId: row.interviewId,
      turnIndex: row.turnIndex,
      state: JSON.parse(row.stateJson),
      stateHash: row.stateHash,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async saveCheckpoint(checkpoint: NewCheckpoint): Promise<WriteResult & { turnIndex: number }> {
    if (!checkpoint.interviewId) throw new Error("saveCheckpoint requires interviewId");
    if (!Number.isInteger(checkpoint.turnIndex) || checkpoint.turnIndex < 0) {
      throw new Error("saveCheckpoint requires a non-negative integer turnIndex");
    }
    if (!checkpoint.stateHash) throw new Error("saveCheckpoint requires stateHash");

    const span = this.telemetry.withContext({ interviewId: checkpoint.interviewId }).startSpan("session_store.save_checkpoint", { turnIndex: checkpoint.turnIndex });
    let row: SnapshotRow;
    try {
      row = await this.db.interviewerStateSnapshot.create({
        data: {
          interviewId: checkpoint.interviewId,
          turnIndex: checkpoint.turnIndex,
          stateJson: JSON.stringify(checkpoint.state ?? null),
          stateHash: checkpoint.stateHash,
        },
      });
    } catch (err) {
      span.recordException(err);
      span.end("error");
      if (isUniqueViolation(err)) {
        throw new Error(`Checkpoint for turn ${checkpoint.turnIndex} already exists; checkpoints are immutable`);
      }
      throw err;
    }

    // Hot copy: only ever the highest turn, best effort, bounded.
    let durability: Durability = "postgres";
    const redis = await this.accelerator();
    if (redis) {
      try {
        const key = HOT_KEY_PREFIX + row.interviewId;
        const existing = await withRedisTimeout(redis.get(key), REDIS_CALL_TIMEOUT_MS, "hot get");
        const hot = parseHot(existing);
        if (!hot || row.turnIndex > hot.turnIndex) {
          await withRedisTimeout(redis.set(key, JSON.stringify(this.toCheckpoint(row)), { ex: this.hotTtlSeconds }), REDIS_CALL_TIMEOUT_MS, "hot set");
        }
        this.acceleratorHealthy = true;
        durability = "postgres+redis";
      } catch (err) {
        this.acceleratorHealthy = false;
        noteRedisDegraded("session-store-adapter", err);
      }
    }
    span.setAttribute("durability", durability);
    span.end();
    this.telemetry.counter("session_store.checkpoints", 1, { durability });
    return { durability, turnIndex: row.turnIndex };
  }

  async loadLatest(interviewId: string): Promise<SessionCheckpoint | null> {
    const redis = await this.accelerator();
    if (redis) {
      try {
        const hot = parseHot(await withRedisTimeout(redis.get(HOT_KEY_PREFIX + interviewId), REDIS_CALL_TIMEOUT_MS, "hot get"));
        this.acceleratorHealthy = true;
        if (hot) return hot;
      } catch (err) {
        this.acceleratorHealthy = false;
        noteRedisDegraded("session-store-adapter", err);
      }
    }
    const row = await this.db.interviewerStateSnapshot.findFirst({ where: { interviewId }, orderBy: { turnIndex: "desc" } });
    return row ? this.toCheckpoint(row) : null;
  }

  async lease(interviewId: string, ownerId: string, ttlMs: number): Promise<LeaseResult> {
    if (!(ttlMs > 0)) throw new Error("lease requires ttlMs > 0");
    await this.accelerator(); // refresh the accelerator state the durability field reports
    const now = new Date(this.now());
    const expiresAt = new Date(now.getTime() + ttlMs);
    const token = randomUUID();
    const durability = this.durability();

    const current = await this.db.interviewLease.findUnique({ where: { interviewId } });
    if (!current) {
      try {
        const created = await this.db.interviewLease.create({ data: { interviewId, ownerId, token, expiresAt } });
        return { acquired: true, lease: toLease(created), durability };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Lost the race: fall through to the conditional update below.
      }
    }
    // Take over only an expired lease or one we already own (atomic conditional update).
    const result = await this.db.interviewLease.updateMany({
      where: { interviewId, OR: [{ expiresAt: { lte: now } }, { ownerId }] },
      data: { ownerId, token, expiresAt },
    });
    if (result.count === 1) {
      return { acquired: true, lease: { interviewId, ownerId, token, expiresAt: expiresAt.toISOString() }, durability };
    }
    const holder = await this.db.interviewLease.findUnique({ where: { interviewId } });
    return { acquired: false, heldBy: holder?.ownerId ?? "unknown", durability };
  }

  async renewLease(lease: Lease, ttlMs: number): Promise<RenewResult> {
    if (!(ttlMs > 0)) throw new Error("renewLease requires ttlMs > 0");
    await this.accelerator();
    const now = new Date(this.now());
    const expiresAt = new Date(now.getTime() + ttlMs);
    const result = await this.db.interviewLease.updateMany({
      where: { interviewId: lease.interviewId, token: lease.token, expiresAt: { gt: now } },
      data: { expiresAt },
    });
    if (result.count !== 1) return { renewed: false, durability: this.durability() };
    return { renewed: true, lease: { ...lease, expiresAt: expiresAt.toISOString() }, durability: this.durability() };
  }

  async release(lease: Lease): Promise<ReleaseResult> {
    await this.accelerator();
    const result = await this.db.interviewLease.deleteMany({ where: { interviewId: lease.interviewId, token: lease.token } });
    return { released: result.count === 1, durability: this.durability() };
  }
}

function toLease(row: LeaseRow): Lease {
  return { interviewId: row.interviewId, ownerId: row.ownerId, token: row.token, expiresAt: row.expiresAt.toISOString() };
}

function parseHot(value: unknown): SessionCheckpoint | null {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && Number.isInteger((parsed as SessionCheckpoint).turnIndex)) return parsed as SessionCheckpoint;
  } catch {
    /* corrupt hot copy: ignore, Postgres is authoritative */
  }
  return null;
}

let defaultStore: InterviewSessionStore | null = null;

/** Process-wide store over Prisma + Upstash for application code. */
export async function getInterviewSessionStore(): Promise<InterviewSessionStore> {
  if (defaultStore) return defaultStore;
  const { prisma } = await import("@/lib/prisma");
  defaultStore = new PrismaRedisInterviewSessionStore({
    db: prisma as unknown as SessionStoreDb,
    redis: async () => {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) return null;
      const { Redis } = await import("@upstash/redis");
      return new Redis({ url, token }) as unknown as SessionStoreRedis;
    },
  });
  return defaultStore;
}

export function setInterviewSessionStoreForTests(store: InterviewSessionStore | null): void {
  defaultStore = store;
}

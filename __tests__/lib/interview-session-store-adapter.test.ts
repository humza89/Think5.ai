import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInterviewSessionStoreConformance } from "@/lib/contracts/conformance/interview-session-store";
import { InMemoryTelemetry } from "@/lib/contracts/telemetry";
import {
  PrismaRedisInterviewSessionStore,
  type LeaseRow,
  type SessionStoreDb,
  type SessionStoreRedis,
  type SnapshotRow,
} from "@/lib/interview-session-store";

vi.mock("@/lib/metrics", () => ({ incrementCounter: vi.fn() }));

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

/** In-memory stand-in for the two Prisma delegates the store uses. */
function fakeDb(clock: { now: number }) {
  const snapshots: SnapshotRow[] = [];
  const leases = new Map<string, LeaseRow>();
  const db: SessionStoreDb = {
    interviewerStateSnapshot: {
      async create({ data }) {
        if (snapshots.some((s) => s.interviewId === data.interviewId && s.turnIndex === data.turnIndex)) throw uniqueViolation();
        const row = { ...data, createdAt: new Date(clock.now) };
        snapshots.push(row);
        return row;
      },
      async findFirst({ where }) {
        const rows = snapshots.filter((s) => s.interviewId === where.interviewId).sort((a, b) => b.turnIndex - a.turnIndex);
        return rows[0] ?? null;
      },
    },
    interviewLease: {
      async findUnique({ where }) { return leases.get(where.interviewId) ?? null; },
      async create({ data }) { if (leases.has(data.interviewId)) throw uniqueViolation(); leases.set(data.interviewId, { ...data }); return data; },
      async updateMany({ where, data }) {
        const row = leases.get(where.interviewId);
        if (!row) return { count: 0 };
        if (where.token !== undefined && row.token !== where.token) return { count: 0 };
        if (where.expiresAt?.gt && !(row.expiresAt > where.expiresAt.gt)) return { count: 0 };
        if (where.OR && !where.OR.some((c) => (c.expiresAt?.lte ? row.expiresAt <= c.expiresAt.lte : false) || (c.ownerId !== undefined && row.ownerId === c.ownerId))) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async deleteMany({ where }) {
        const row = leases.get(where.interviewId);
        if (!row || row.token !== where.token) return { count: 0 };
        leases.delete(where.interviewId);
        return { count: 1 };
      },
    },
  };
  return { db, snapshots, leases };
}

function fakeRedis(behaviour: { failing?: boolean } = {}) {
  const data = new Map<string, string>();
  const calls: string[] = [];
  const redis: SessionStoreRedis = {
    async get(key) { calls.push(`get ${key}`); if (behaviour.failing) throw new Error("ECONNRESET"); return data.get(key) ?? null; },
    async set(key, value) { calls.push(`set ${key}`); if (behaviour.failing) throw new Error("ECONNRESET"); data.set(key, value); return "OK"; },
  };
  return { redis, data, calls, behaviour };
}

describe("PrismaRedisInterviewSessionStore (T11)", () => {
  let clock: { now: number };
  beforeEach(() => { clock = { now: Date.parse("2026-09-25T12:00:00Z") }; });

  it("passes the T0.5 conformance harness, including the accelerator downgrade and lease expiry", async () => {
    const violations = await runInterviewSessionStoreConformance({
      create: () => {
        const { db } = fakeDb(clock);
        const { redis } = fakeRedis();
        return new PrismaRedisInterviewSessionStore({ db, redis: async () => redis, now: () => clock.now });
      },
      disableAccelerator: (store) => (store as PrismaRedisInterviewSessionStore).setAcceleratorEnabled(false),
      advanceClock: (_store, ms) => { clock.now += ms; },
    });
    expect(violations).toEqual([]);
  });

  it("serves loadLatest from the Redis hot copy and falls back to Postgres when Redis fails", async () => {
    const { db } = fakeDb(clock);
    const r = fakeRedis();
    const telemetry = new InMemoryTelemetry();
    const store = new PrismaRedisInterviewSessionStore({ db, redis: async () => r.redis, now: () => clock.now, telemetry });
    expect(await store.saveCheckpoint({ interviewId: "int-1", turnIndex: 0, state: { q: 0 }, stateHash: "h0" })).toEqual({ durability: "postgres+redis", turnIndex: 0 });
    expect(await store.saveCheckpoint({ interviewId: "int-1", turnIndex: 3, state: { q: 3 }, stateHash: "h3" })).toMatchObject({ durability: "postgres+redis" });
    // an out-of-order lower turn is stored in Postgres but never overwrites the hot copy
    await store.saveCheckpoint({ interviewId: "int-1", turnIndex: 1, state: { q: 1 }, stateHash: "h1" });
    r.calls.length = 0;
    expect((await store.loadLatest("int-1"))?.turnIndex).toBe(3);
    expect(r.calls).toEqual(["get voice-checkpoint:int-1"]);

    r.behaviour.failing = true;
    expect((await store.loadLatest("int-1"))?.turnIndex).toBe(3); // Postgres answers
    expect(await store.saveCheckpoint({ interviewId: "int-1", turnIndex: 4, state: { q: 4 }, stateHash: "h4" })).toEqual({ durability: "postgres", turnIndex: 4 });
    expect(telemetry.counters.filter((c) => c.name === "session_store.checkpoints").map((c) => c.attributes.durability)).toEqual(["postgres+redis", "postgres+redis", "postgres+redis", "postgres"]);
    expect(telemetry.spans.every((s) => s.context.interviewId === "int-1")).toBe(true);
  });

  it("rejects a duplicate turn as immutable", async () => {
    const { db } = fakeDb(clock);
    const store = new PrismaRedisInterviewSessionStore({ db, now: () => clock.now });
    await store.saveCheckpoint({ interviewId: "int-2", turnIndex: 5, state: {}, stateHash: "h" });
    await expect(store.saveCheckpoint({ interviewId: "int-2", turnIndex: 5, state: {}, stateHash: "h2" })).rejects.toThrow(/immutable/);
  });

  it("lease decisions stay fail-closed for a second owner with no Redis at all", async () => {
    const { db } = fakeDb(clock);
    const store = new PrismaRedisInterviewSessionStore({ db, now: () => clock.now }); // no accelerator configured
    const a = await store.lease("int-3", "tab-a", 60_000);
    expect(a).toMatchObject({ acquired: true, durability: "postgres" });
    const b = await store.lease("int-3", "tab-b", 60_000);
    expect(b).toMatchObject({ acquired: false, heldBy: "tab-a", durability: "postgres" });
    expect(await store.renewLease({ ...a.lease!, token: "forged" }, 60_000)).toMatchObject({ renewed: false });
    clock.now += 61_000;
    expect(await store.lease("int-3", "tab-b", 60_000)).toMatchObject({ acquired: true });
  });

  it("handles a lost create race by re-evaluating the lease conditionally", async () => {
    const { db, leases } = fakeDb(clock);
    const original = db.interviewLease.create.bind(db.interviewLease);
    db.interviewLease.create = async (args) => {
      // another instance wins between findUnique and create
      leases.set(args.data.interviewId, { interviewId: args.data.interviewId, ownerId: "other", token: "t-other", expiresAt: new Date(clock.now + 30_000) });
      return original(args);
    };
    const store = new PrismaRedisInterviewSessionStore({ db, now: () => clock.now });
    expect(await store.lease("int-4", "me", 60_000)).toMatchObject({ acquired: false, heldBy: "other" });
  });
});

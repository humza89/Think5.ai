import { describe, expect, it } from "vitest";
import {
  InMemoryInterviewSessionStore,
  type InterviewSessionStore,
  type Lease,
  type LeaseResult,
  type NewCheckpoint,
  type ReleaseResult,
  type RenewResult,
  type SessionCheckpoint,
  type WriteResult,
} from "@/lib/contracts/interview-session-store";
import { runInterviewSessionStoreConformance } from "@/lib/contracts/conformance/interview-session-store";

/** Broken on purpose: Redis-only. Losing the accelerator loses state and leases are not fenced. */
class RedisOnlyStore implements InterviewSessionStore {
  redisAvailable = true;
  private hot = new Map<string, SessionCheckpoint>();
  private leases = new Map<string, Lease>();

  async saveCheckpoint(checkpoint: NewCheckpoint): Promise<WriteResult & { turnIndex: number }> {
    if (this.redisAvailable) this.hot.set(checkpoint.interviewId, { ...checkpoint, createdAt: new Date().toISOString() });
    return { durability: "postgres+redis", turnIndex: checkpoint.turnIndex };
  }
  async loadLatest(interviewId: string): Promise<SessionCheckpoint | null> {
    return this.redisAvailable ? (this.hot.get(interviewId) ?? null) : null;
  }
  async lease(interviewId: string, ownerId: string, ttlMs: number): Promise<LeaseResult> {
    const lease = { interviewId, ownerId, token: ownerId, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
    this.leases.set(interviewId, lease);
    return { acquired: true, lease, durability: "postgres+redis" };
  }
  async renewLease(lease: Lease, ttlMs: number): Promise<RenewResult> {
    return { renewed: true, lease: { ...lease, expiresAt: new Date(Date.now() + ttlMs).toISOString() }, durability: "postgres+redis" };
  }
  async release(): Promise<ReleaseResult> {
    return { released: true, durability: "postgres+redis" };
  }
}

function harnessFor() {
  let clock = 1_000_000;
  return {
    create: () => {
      clock = 1_000_000;
      return new InMemoryInterviewSessionStore({ now: () => clock });
    },
    disableAccelerator: (store: InterviewSessionStore) => {
      (store as InMemoryInterviewSessionStore).redisAvailable = false;
    },
    advanceClock: (_store: InterviewSessionStore, ms: number) => {
      clock += ms;
    },
  };
}

describe("InterviewSessionStore conformance", () => {
  it("InMemoryInterviewSessionStore conforms, including accelerator loss and lease expiry", async () => {
    const violations = await runInterviewSessionStoreConformance(harnessFor());
    expect(violations).toEqual([]);
  });

  it("detects a store that treats Redis as authoritative and does not fence leases", async () => {
    const violations = await runInterviewSessionStoreConformance({
      create: () => new RedisOnlyStore(),
      disableAccelerator: (store) => {
        (store as RedisOnlyStore).redisAvailable = false;
      },
    });
    expect(violations).toContain("a second owner must not acquire an active lease");
    expect(violations).toContain('with the accelerator down, writes must report durability "postgres"');
    expect(violations).toContain("with the accelerator down, loadLatest must still return the authoritative checkpoint");
    expect(violations).toContain("overwriting an existing turnIndex: expected a rejection but the call succeeded");
  });

  it("reports postgres+redis while the accelerator is up and postgres after it drops", async () => {
    const store = new InMemoryInterviewSessionStore();
    expect((await store.saveCheckpoint({ interviewId: "i", turnIndex: 0, state: {}, stateHash: "a" })).durability).toBe("postgres+redis");
    store.redisAvailable = false;
    expect((await store.saveCheckpoint({ interviewId: "i", turnIndex: 1, state: {}, stateHash: "b" })).durability).toBe("postgres");
    expect((await store.loadLatest("i"))?.turnIndex).toBe(1);
  });
});

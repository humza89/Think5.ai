import type { InterviewSessionStore } from "../interview-session-store";
import { expectRejects, guard, type Violations } from "./shared";

export interface SessionStoreHarness {
  /** Fresh store per run. */
  create: () => InterviewSessionStore;
  /**
   * Optional: make the accelerator (Redis) unavailable for the given store.
   * When provided, the runner asserts the durability downgrade contract.
   */
  disableAccelerator?: (store: InterviewSessionStore) => void;
  /** Optional: advance the store's clock, for lease expiry checks. */
  advanceClock?: (store: InterviewSessionStore, ms: number) => void;
}

const DURABILITIES = new Set(["postgres", "postgres+redis"]);

/** Verifies checkpoint immutability/ordering, durability reporting and lease fencing. */
export async function runInterviewSessionStoreConformance(harness: SessionStoreHarness): Promise<Violations> {
  const violations: Violations = [];

  await guard(async () => {
    const store = harness.create();
    const w1 = await store.saveCheckpoint({ interviewId: "i-1", turnIndex: 0, state: { q: 1 }, stateHash: "h0" });
    if (!DURABILITIES.has(w1.durability)) violations.push(`saveCheckpoint returned unknown durability ${w1.durability}`);
    if (w1.turnIndex !== 0) violations.push("saveCheckpoint must echo the turnIndex it stored");

    await store.saveCheckpoint({ interviewId: "i-1", turnIndex: 2, state: { q: 3 }, stateHash: "h2" });
    await store.saveCheckpoint({ interviewId: "i-1", turnIndex: 1, state: { q: 2 }, stateHash: "h1" });
    const latest = await store.loadLatest("i-1");
    if (!latest) violations.push("loadLatest must return the stored checkpoint");
    else {
      if (latest.turnIndex !== 2) violations.push("loadLatest must return the highest turnIndex, not the last written");
      if (!latest.createdAt || Number.isNaN(Date.parse(latest.createdAt))) violations.push("checkpoints must carry an ISO createdAt");
      if (JSON.stringify(latest.state) !== JSON.stringify({ q: 3 })) violations.push("loadLatest must return the checkpoint state");
    }
    if ((await store.loadLatest("missing")) !== null) violations.push("loadLatest must return null for an unknown interview");
  }, "checkpoint ordering", violations);

  await expectRejects(async () => {
    const store = harness.create();
    await store.saveCheckpoint({ interviewId: "i-2", turnIndex: 0, state: {}, stateHash: "a" });
    await store.saveCheckpoint({ interviewId: "i-2", turnIndex: 0, state: { changed: true }, stateHash: "b" });
  }, "overwriting an existing turnIndex", violations);

  await guard(async () => {
    const store = harness.create();
    const a = await store.lease("i-3", "owner-a", 10_000);
    if (!a.acquired || !a.lease) {
      violations.push("first lease must be acquired");
      return;
    }
    const b = await store.lease("i-3", "owner-b", 10_000);
    if (b.acquired) violations.push("a second owner must not acquire an active lease");
    if (b.heldBy !== "owner-a") violations.push("a denied lease must report who holds it");

    const renewed = await store.renewLease(a.lease, 10_000);
    if (!renewed.renewed || !renewed.lease) violations.push("the holder must be able to renew");
    const forged = await store.renewLease({ ...a.lease, token: "forged" }, 10_000);
    if (forged.renewed) violations.push("renewLease must reject a wrong fencing token");

    const releasedByOther = await store.release({ ...a.lease, token: "forged" });
    if (releasedByOther.released) violations.push("release must reject a wrong fencing token");
    const released = await store.release(a.lease);
    if (!released.released) violations.push("the holder must be able to release");
    const again = await store.lease("i-3", "owner-b", 10_000);
    if (!again.acquired) violations.push("after release another owner must acquire the lease");
  }, "lease fencing", violations);

  if (harness.advanceClock) {
    await guard(async () => {
      const store = harness.create();
      const a = await store.lease("i-4", "owner-a", 1_000);
      if (!a.acquired) violations.push("lease must be acquired before expiry test");
      harness.advanceClock!(store, 2_000);
      const b = await store.lease("i-4", "owner-b", 1_000);
      if (!b.acquired) violations.push("an expired lease must be acquirable by another owner");
    }, "lease expiry", violations);
  }

  if (harness.disableAccelerator) {
    await guard(async () => {
      const store = harness.create();
      await store.saveCheckpoint({ interviewId: "i-5", turnIndex: 0, state: { v: "before" }, stateHash: "x" });
      harness.disableAccelerator!(store);
      const write = await store.saveCheckpoint({ interviewId: "i-5", turnIndex: 1, state: { v: "after" }, stateHash: "y" });
      if (write.durability !== "postgres") violations.push("with the accelerator down, writes must report durability \"postgres\"");
      const latest = await store.loadLatest("i-5");
      if (!latest || latest.turnIndex !== 1) violations.push("with the accelerator down, loadLatest must still return the authoritative checkpoint");
      const lease = await store.lease("i-5", "owner-a", 5_000);
      if (!lease.acquired) violations.push("with the accelerator down, leases must still be granted");
      const second = await store.lease("i-5", "owner-b", 5_000);
      if (second.acquired) violations.push("with the accelerator down, a second owner must still be fenced out");
    }, "accelerator loss is a durability downgrade", violations);
  }

  return violations;
}

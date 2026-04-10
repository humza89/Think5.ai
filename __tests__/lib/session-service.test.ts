import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryLifecycleStore,
  createSession,
  getSession,
  heartbeat,
  isLegalTransition,
  isTerminalState,
  transition,
  type SessionLifecycleState,
} from "@/lib/session-service";

// Deterministic clock for tests so updatedAt/lastSeenAt are predictable.
let fakeNowMs = 1_700_000_000_000;
const tick = (ms: number) => {
  fakeNowMs += ms;
};
const now = () => new Date(fakeNowMs);

describe("SessionService — state machine", () => {
  describe("isTerminalState", () => {
    it("marks completed and failed as terminal", () => {
      expect(isTerminalState("completed")).toBe(true);
      expect(isTerminalState("failed")).toBe(true);
    });
    it("marks every other state as non-terminal", () => {
      for (const s of ["pending", "active", "reconnecting", "paused"] as SessionLifecycleState[]) {
        expect(isTerminalState(s)).toBe(false);
      }
    });
  });

  describe("isLegalTransition — explicit table", () => {
    // Every (from, to) pair the state machine should accept.
    const legalPairs: [SessionLifecycleState, SessionLifecycleState][] = [
      ["pending", "active"],
      ["pending", "failed"],
      ["active", "reconnecting"],
      ["active", "paused"],
      ["active", "completed"],
      ["active", "failed"],
      ["reconnecting", "active"],
      ["reconnecting", "failed"],
      ["paused", "active"],
      ["paused", "failed"],
    ];
    for (const [from, to] of legalPairs) {
      it(`allows ${from} → ${to}`, () => {
        expect(isLegalTransition(from, to)).toBe(true);
      });
    }

    // A representative sample of pairs that should be rejected.
    const illegalPairs: [SessionLifecycleState, SessionLifecycleState][] = [
      ["pending", "reconnecting"], // can't reconnect before being active
      ["pending", "paused"],
      ["pending", "completed"],
      ["active", "pending"], // no going backwards
      ["reconnecting", "paused"], // must resolve reconnect first
      ["reconnecting", "completed"],
      ["paused", "reconnecting"],
      ["paused", "completed"], // resume before completing
      ["completed", "active"], // terminal
      ["failed", "active"], // terminal
    ];
    for (const [from, to] of illegalPairs) {
      it(`rejects ${from} → ${to}`, () => {
        expect(isLegalTransition(from, to)).toBe(false);
      });
    }
  });
});

describe("SessionService — persistence", () => {
  let store: InMemoryLifecycleStore;

  beforeEach(() => {
    store = new InMemoryLifecycleStore();
    fakeNowMs = 1_700_000_000_000;
  });

  describe("createSession", () => {
    it("creates a new session in pending state", async () => {
      const res = await createSession({ interviewId: "iv1", store, now });
      expect(res.ok).toBe(true);
      expect(res.record.state).toBe("pending");
      expect(res.record.interviewId).toBe("iv1");
      expect(res.record.history).toEqual([]);
      expect(res.record.ownerToken).not.toBe("");
    });

    it("refuses to recreate an existing session", async () => {
      await createSession({ interviewId: "iv1", store, now });
      const res = await createSession({ interviewId: "iv1", store, now });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("stale_from");
    });
  });

  describe("transition — happy path", () => {
    it("pending → active → completed records history", async () => {
      await createSession({ interviewId: "iv1", store, now });

      tick(1000);
      const activate = await transition({
        interviewId: "iv1",
        expectedFrom: "pending",
        to: "active",
        reason: "first_audio_frame",
        store,
        now,
      });
      expect(activate.ok).toBe(true);
      expect(activate.record.state).toBe("active");
      expect(activate.record.history).toHaveLength(1);
      expect(activate.record.history[0]).toMatchObject({
        from: "pending",
        to: "active",
        reason: "first_audio_frame",
      });

      tick(5000);
      const complete = await transition({
        interviewId: "iv1",
        expectedFrom: "active",
        to: "completed",
        reason: "candidate_finished",
        store,
        now,
      });
      expect(complete.ok).toBe(true);
      expect(complete.record.state).toBe("completed");
      expect(complete.record.history).toHaveLength(2);
    });

    it("active → reconnecting → active round-trip", async () => {
      await createSession({ interviewId: "iv2", store, now });
      await transition({ interviewId: "iv2", expectedFrom: "pending", to: "active", reason: "join", store, now });

      tick(1000);
      const drop = await transition({
        interviewId: "iv2",
        expectedFrom: "active",
        to: "reconnecting",
        reason: "ws_close_1006",
        store,
        now,
      });
      expect(drop.ok).toBe(true);

      tick(2000);
      const recover = await transition({
        interviewId: "iv2",
        expectedFrom: "reconnecting",
        to: "active",
        reason: "reconnect_success",
        store,
        now,
      });
      expect(recover.ok).toBe(true);
      expect(recover.record.history).toHaveLength(3);
    });
  });

  describe("transition — rejections", () => {
    it("rejects with not_found when no record exists", async () => {
      const res = await transition({
        interviewId: "missing",
        expectedFrom: "active",
        to: "completed",
        reason: "n/a",
        store,
        now,
      });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("not_found");
    });

    it("rejects with illegal when the transition isn't in the table", async () => {
      await createSession({ interviewId: "iv1", store, now });
      const res = await transition({
        interviewId: "iv1",
        expectedFrom: "pending",
        to: "reconnecting", // illegal — can only go pending → active|failed
        reason: "n/a",
        store,
        now,
      });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("illegal");
      // Original record untouched
      expect(res.record.state).toBe("pending");
    });

    it("rejects with stale_from when expectedFrom doesn't match current", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "active", reason: "join", store, now });
      // Now try to transition from "pending" again — state is actually "active"
      const res = await transition({
        interviewId: "iv1",
        expectedFrom: "pending",
        to: "failed",
        reason: "racer",
        store,
        now,
      });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("stale_from");
      expect(res.record.state).toBe("active");
    });

    it("rejects with terminal once the session is completed", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "active", reason: "join", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "active", to: "completed", reason: "done", store, now });
      const res = await transition({
        interviewId: "iv1",
        expectedFrom: "completed",
        to: "active",
        reason: "try to resurrect",
        store,
        now,
      });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("terminal");
    });

    it("rejects with terminal once the session has failed", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "failed", reason: "mic_denied", store, now });
      const res = await transition({
        interviewId: "iv1",
        expectedFrom: "failed",
        to: "active",
        reason: "retry",
        store,
        now,
      });
      expect(res.ok).toBe(false);
      expect(res.rejection).toBe("terminal");
    });
  });

  describe("heartbeat", () => {
    it("updates lastSeenAt without advancing state", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "active", reason: "join", store, now });

      const beforeRecord = await getSession("iv1", store);
      const beforeSeen = beforeRecord!.lastSeenAt;
      tick(5000);

      const hb = await heartbeat({ interviewId: "iv1", store, now });
      expect(hb.ok).toBe(true);
      expect(hb.record.state).toBe("active");
      expect(hb.record.lastSeenAt).not.toBe(beforeSeen);
    });

    it("returns not_found when no session exists", async () => {
      const hb = await heartbeat({ interviewId: "ghost", store, now });
      expect(hb.ok).toBe(false);
      expect(hb.rejection).toBe("not_found");
    });

    it("returns terminal once the session has failed", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "failed", reason: "x", store, now });
      const hb = await heartbeat({ interviewId: "iv1", store, now });
      expect(hb.ok).toBe(false);
      expect(hb.rejection).toBe("terminal");
    });
  });

  describe("history buffer", () => {
    it("caps transition history at 20 entries", async () => {
      await createSession({ interviewId: "iv1", store, now });
      await transition({ interviewId: "iv1", expectedFrom: "pending", to: "active", reason: "0", store, now });

      // Bounce active ↔ reconnecting many times
      let from: SessionLifecycleState = "active";
      let to: SessionLifecycleState = "reconnecting";
      for (let i = 1; i < 30; i++) {
        tick(100);
        const res = await transition({
          interviewId: "iv1",
          expectedFrom: from,
          to,
          reason: `bounce_${i}`,
          store,
          now,
        });
        expect(res.ok).toBe(true);
        [from, to] = [to, from];
      }

      const final = await getSession("iv1", store);
      expect(final!.history.length).toBeLessThanOrEqual(20);
      // The most recent entry must be present
      expect(final!.history[final!.history.length - 1].reason).toBe("bounce_29");
    });
  });
});

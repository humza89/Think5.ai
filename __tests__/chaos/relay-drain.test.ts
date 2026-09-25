/**
 * T11 Step 6 chaos test: a relay machine is stopped during an interview.
 * The relay announces `relay.draining`, then closes with 1001; the browser
 * must reconnect immediately through the existing recovery state machine and
 * must not count the planned restart as reconnect churn. Fly must not SIGKILL
 * the machine before the drain window has passed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRAIN_RECONNECT_MIN_MS, drainingUntil, isRelayDrainingFrame, planReconnect } from "@/lib/relay-drain";

const relaySource = readFileSync("relay/server.ts", "utf8");
const flyToml = readFileSync("relay/fly.toml", "utf8");
const hookSource = readFileSync("hooks/useVoiceInterview.ts", "utf8");

describe("CHAOS (T11): relay machine stop during an interview", () => {
  it("recognises the draining control frame and computes its window", () => {
    expect(isRelayDrainingFrame({ type: "relay.draining", reason: "deploy_restart", drainMs: 10_000 })).toBe(true);
    expect(isRelayDrainingFrame({ serverContent: {} })).toBe(false);
    expect(drainingUntil({ type: "relay.draining", drainMs: 10_000 }, 1_000)).toBe(16_000);
    expect(drainingUntil({ type: "relay.draining" }, 1_000)).toBe(16_000); // default drain window
  });

  it("reconnects at once after a planned drain, exempt from the rapid-reconnect limit", () => {
    const until = drainingUntil({ type: "relay.draining", drainMs: 10_000 }, 0);
    const plan = planReconnect({ closeCode: 1001, drainingUntil: until, attempt: 0, now: 600, random: () => 0.5 });
    expect(plan).toEqual({ kind: "deploy_restart", delayMs: DRAIN_RECONNECT_MIN_MS + 250, countsTowardRateLimit: false });
    // three planned restarts in a row never trip the 3-in-60s churn limit
    const timestamps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = planReconnect({ closeCode: 1001, drainingUntil: until, attempt: i, now: 700 + i });
      if (p.countsTowardRateLimit) timestamps.push(700 + i);
    }
    expect(timestamps).toHaveLength(0);
  });

  it("keeps exponential backoff for unplanned closes and for closes outside the drain window", () => {
    const unplanned = planReconnect({ closeCode: 1006, drainingUntil: 0, attempt: 2, random: () => 0 });
    expect(unplanned).toEqual({ kind: "unplanned", delayMs: 4000, countsTowardRateLimit: true });
    const stale = planReconnect({ closeCode: 1001, drainingUntil: 10_000, attempt: 0, now: 20_000, random: () => 0 });
    expect(stale.kind).toBe("unplanned");
    expect(planReconnect({ closeCode: 1006, drainingUntil: 0, attempt: 10, random: () => 1 }).delayMs).toBe(10_000);
  });

  it("relay sends relay.draining before closing and marks itself degraded while draining", () => {
    const drainingIdx = relaySource.indexOf('type: "relay.draining"');
    const closeIdx = relaySource.indexOf('ws.close(1001, "Server shutting down")');
    expect(drainingIdx).toBeGreaterThan(0);
    expect(closeIdx).toBeGreaterThan(drainingIdx);
    expect(relaySource).toMatch(/metrics\.draining = true/);
    expect(relaySource).toMatch(/if \(metrics\.draining\) reasons\.push\("draining"\)/);
  });

  it("Fly kill_timeout exceeds the relay drain window plus notice delay and Sentry flush", () => {
    const drainMs = Number(/const GRACEFUL_DRAIN_MS = ([\d_]+)/.exec(relaySource)![1].replace(/_/g, ""));
    const killTimeoutS = Number(/kill_timeout = '(\d+)s'/.exec(flyToml)![1]);
    expect(drainMs).toBe(10_000);
    expect(killTimeoutS * 1000).toBeGreaterThanOrEqual(drainMs + 500 + 2000 + 5000);
    expect(flyToml).toMatch(/kill_signal = 'SIGTERM'/);
  });

  it("the voice hook consumes the frame and plans the reconnect through the shared helper", () => {
    expect(hookSource).toMatch(/isRelayDrainingFrame\(data\)/);
    expect(hookSource).toMatch(/planReconnect\(\{ closeCode: event\.code, drainingUntil: relayDrainingUntilRef\.current/);
    expect(hookSource).toMatch(/if \(plan\.countsTowardRateLimit\) reconnectTimestampsRef\.current\.push/);
  });
});

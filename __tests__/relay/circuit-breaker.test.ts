/**
 * relay/circuit-breaker — CLOSED → OPEN → HALF_OPEN → CLOSED state machine.
 */

import { describe, expect, it } from "vitest";
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from "../../relay/circuit-breaker";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function make(config = { failureThreshold: 3, failureWindowMs: 60_000, cooldownMs: 30_000 }) {
  const c = clock();
  return { cb: new CircuitBreaker(config, c.now), c };
}

describe("CircuitBreaker", () => {
  it("defaults to 3 failures / 60 s window / 30 s cooldown", () => {
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG).toEqual({ failureThreshold: 3, failureWindowMs: 60_000, cooldownMs: 30_000 });
    expect(new CircuitBreaker().config).toEqual(DEFAULT_CIRCUIT_BREAKER_CONFIG);
  });

  it("starts CLOSED and allows attempts", () => {
    const { cb } = make();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
    expect(cb.msUntilRetry()).toBe(0);
  });

  it("stays CLOSED below the threshold", () => {
    const { cb } = make();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getFailureCount()).toBe(2);
  });

  it("opens at the threshold and refuses attempts during the cooldown", () => {
    const { cb, c } = make();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false);
    expect(cb.msUntilRetry()).toBe(30_000);
    c.advance(10_000);
    expect(cb.canAttempt()).toBe(false);
    expect(cb.msUntilRetry()).toBe(20_000);
  });

  it("does not open when failures fall outside the window", () => {
    const { cb, c } = make({ failureThreshold: 3, failureWindowMs: 10_000, cooldownMs: 5_000 });
    cb.recordFailure();
    c.advance(6_000);
    cb.recordFailure();
    c.advance(6_000);
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(2);
  });

  it("moves OPEN → HALF_OPEN after the cooldown and lets exactly one probe through", () => {
    const { cb, c } = make({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    c.advance(5_000);
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(cb.canAttempt()).toBe(false); // probe in flight
    expect(cb.msUntilRetry()).toBe(5_000);
  });

  it("closes on a successful probe and clears the failure window", () => {
    const { cb, c } = make({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    c.advance(5_000);
    cb.canAttempt();
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getFailureCount()).toBe(0);
  });

  it("reopens on a failed probe and restarts the cooldown", () => {
    const { cb, c } = make({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    c.advance(5_000);
    cb.canAttempt();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false);
    expect(cb.msUntilRetry()).toBe(5_000);
  });

  it("recordSuccess while CLOSED is a no-op", () => {
    const { cb } = make();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.getFailureCount()).toBe(0);
  });

  it("full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED", () => {
    const { cb, c } = make({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 1_000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    c.advance(1_000);
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe("HALF_OPEN");
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
  });
});

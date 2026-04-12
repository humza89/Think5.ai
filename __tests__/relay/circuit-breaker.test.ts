/**
 * Track 7 Task 28 tests for relay/circuit-breaker.ts.
 *
 * The circuit breaker is a pure state machine with no I/O — tests
 * exercise the full CLOSED → OPEN → HALF_OPEN → CLOSED cycle and
 * verify the failure threshold, cooldown, and probe semantics.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "../../relay/circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in CLOSED state and allows attempts", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
  });

  it("stays CLOSED after failures below the threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, failureWindowMs: 60_000, cooldownMs: 30_000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
  });

  it("opens after reaching the failure threshold within the window", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, failureWindowMs: 60_000, cooldownMs: 30_000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false);
  });

  it("does NOT open if failures are spread outside the window", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, failureWindowMs: 10_000, cooldownMs: 5_000 });
    cb.recordFailure();
    vi.advanceTimersByTime(6_000);
    cb.recordFailure();
    vi.advanceTimersByTime(6_000);
    cb.recordFailure();
    // Each failure is >10s apart from the first, so only 1 is in the window
    expect(cb.getState()).toBe("CLOSED");
  });

  it("transitions from OPEN to HALF_OPEN after cooldown", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false);

    vi.advanceTimersByTime(5_000);
    // canAttempt() should transition to HALF_OPEN and allow one probe
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  it("transitions from HALF_OPEN to CLOSED on probe success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5_000);
    cb.canAttempt(); // triggers HALF_OPEN

    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getFailureCount()).toBe(0); // failures cleared
  });

  it("transitions from HALF_OPEN back to OPEN on probe failure", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5_000);
    cb.canAttempt(); // triggers HALF_OPEN

    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false); // back to blocked
  });

  it("blocks additional attempts while HALF_OPEN probe is in flight", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 5_000 });
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5_000);

    expect(cb.canAttempt()).toBe(true); // first call → HALF_OPEN, allowed
    expect(cb.canAttempt()).toBe(false); // second call → still HALF_OPEN, blocked
  });

  it("recordSuccess from CLOSED is a no-op (no state change)", () => {
    const cb = new CircuitBreaker();
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("getFailureCount only counts failures within the window", () => {
    const cb = new CircuitBreaker({ failureThreshold: 10, failureWindowMs: 5_000, cooldownMs: 1_000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getFailureCount()).toBe(3);

    vi.advanceTimersByTime(6_000);
    expect(cb.getFailureCount()).toBe(0); // pruned
  });

  it("full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, failureWindowMs: 60_000, cooldownMs: 1_000 });

    // CLOSED
    expect(cb.getState()).toBe("CLOSED");
    cb.recordFailure();
    cb.recordFailure();

    // OPEN
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canAttempt()).toBe(false);

    vi.advanceTimersByTime(1_000);

    // HALF_OPEN
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe succeeds
    cb.recordSuccess();

    // Back to CLOSED
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.canAttempt()).toBe(true);
  });
});

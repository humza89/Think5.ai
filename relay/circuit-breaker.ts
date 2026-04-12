/**
 * Circuit Breaker — Track 7 Task 28.
 *
 * Wraps the Gemini Live connection with a circuit breaker so sustained
 * provider outages are detected and the relay can degrade gracefully
 * instead of burning through all reconnect attempts per-session.
 *
 * The breaker tracks failures across ALL sessions (global state on the
 * relay instance), not per-session. This means a Gemini-wide outage
 * trips the breaker quickly even if each individual session has only
 * seen 1–2 failures.
 *
 * States:
 *   CLOSED     — normal operation. All connection attempts proceed.
 *   OPEN       — Gemini is assumed down. New connection attempts are
 *                immediately rejected with a typed error. Existing
 *                sessions fall back to text mode (or reconnect later).
 *   HALF_OPEN  — after the cooldown, the next single connection attempt
 *                is allowed through as a probe. If it succeeds, the
 *                breaker transitions back to CLOSED. If it fails, it
 *                reopens.
 *
 * Configuration (tuned for voice interview latency expectations):
 *   failureThreshold: 3 failures within the window → OPEN
 *   failureWindowMs:  60_000 (1 minute)
 *   cooldownMs:       30_000 (30 seconds in OPEN before HALF_OPEN probe)
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  failureWindowMs: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  failureWindowMs: 60_000,
  cooldownMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number[] = []; // timestamps of recent failures
  private lastOpenedAt = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether a connection attempt is allowed.
   * Returns true if allowed, false if the breaker is OPEN and the
   * cooldown hasn't elapsed.
   */
  canAttempt(): boolean {
    this.pruneOldFailures();

    if (this.state === "CLOSED") return true;

    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= this.config.cooldownMs) {
        // Transition to HALF_OPEN — allow one probe
        this.state = "HALF_OPEN";
        console.log(`[CircuitBreaker] HALF_OPEN — allowing probe after ${elapsed}ms cooldown`);
        return true;
      }
      return false;
    }

    // HALF_OPEN: a single probe is in flight. Block additional attempts
    // until the probe resolves (recordSuccess or recordFailure).
    return false;
  }

  /**
   * Record a successful connection. Resets the breaker to CLOSED.
   */
  recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      console.log("[CircuitBreaker] Probe succeeded → CLOSED");
    }
    this.state = "CLOSED";
    this.failures = [];
  }

  /**
   * Record a connection failure. If the failure threshold is crossed
   * within the window, the breaker opens.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.pruneOldFailures();

    if (this.state === "HALF_OPEN") {
      // Probe failed — reopen
      this.state = "OPEN";
      this.lastOpenedAt = now;
      console.log("[CircuitBreaker] Probe failed → OPEN (re-entering cooldown)");
      return;
    }

    if (this.failures.length >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.lastOpenedAt = now;
      console.log(
        `[CircuitBreaker] ${this.failures.length} failures in ${this.config.failureWindowMs}ms → OPEN`,
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    this.pruneOldFailures();
    return this.failures.length;
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}

/**
 * Typed error thrown when the circuit breaker blocks a connection attempt.
 * Callers should catch this and fall back to text mode or show a
 * degraded-provider UI instead of blindly retrying.
 */
export class CircuitOpenError extends Error {
  readonly state: CircuitState;
  readonly cooldownMs: number;
  constructor(state: CircuitState, cooldownMs: number) {
    super(`Circuit breaker is ${state} — connection attempt blocked (cooldown ${cooldownMs}ms)`);
    this.name = "CircuitOpenError";
    this.state = state;
    this.cooldownMs = cooldownMs;
  }
}

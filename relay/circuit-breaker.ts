/**
 * Provider circuit breaker for the Gemini Live upstream.
 *
 * Salvaged from legacy PR #11 (Track 7, Task 28). One breaker is shared by
 * every session on a relay instance, so a Gemini-wide outage trips it after a
 * few failures instead of each session burning its whole reconnect budget
 * against a provider that is known to be down.
 *
 * States:
 *   CLOSED    — normal operation; connection attempts proceed.
 *   OPEN      — provider assumed down; attempts are refused until the
 *               cooldown elapses.
 *   HALF_OPEN — after the cooldown a single probe attempt is allowed; success
 *               closes the breaker, failure reopens it.
 *
 * Defaults (tuned for voice-interview latency expectations):
 *   failureThreshold 3 within failureWindowMs 60 s → OPEN; cooldownMs 30 s.
 *
 * Pure state machine, no I/O; `now` is injectable for tests.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  failureWindowMs: number;
  cooldownMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  failureWindowMs: 60_000,
  cooldownMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number[] = []; // timestamps of recent failures
  private lastOpenedAt = 0;
  readonly config: CircuitBreakerConfig;

  constructor(
    config: Partial<CircuitBreakerConfig> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Whether a connection attempt may proceed. Moves OPEN → HALF_OPEN once the
   * cooldown has elapsed and lets exactly one probe through.
   */
  canAttempt(): boolean {
    this.pruneOldFailures();

    if (this.state === "CLOSED") return true;

    if (this.state === "OPEN") {
      if (this.now() - this.lastOpenedAt >= this.config.cooldownMs) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }

    // HALF_OPEN: a probe is in flight; block until it resolves.
    return false;
  }

  /** Milliseconds until an attempt may proceed; 0 when one may proceed now. */
  msUntilRetry(): number {
    if (this.state === "CLOSED") return 0;
    if (this.state === "OPEN") {
      return Math.max(0, this.config.cooldownMs - (this.now() - this.lastOpenedAt));
    }
    // HALF_OPEN with a probe in flight: callers should wait roughly a cooldown.
    return this.config.cooldownMs;
  }

  /** A successful connection closes the breaker and clears the failure window. */
  recordSuccess(): void {
    this.state = "CLOSED";
    this.failures = [];
  }

  /** A failed connection; opens the breaker at the threshold or on a failed probe. */
  recordFailure(): void {
    const now = this.now();
    this.failures.push(now);
    this.pruneOldFailures();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.lastOpenedAt = now;
      return;
    }

    if (this.state === "CLOSED" && this.failures.length >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.lastOpenedAt = now;
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
    const cutoff = this.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}

/**
 * Network Simulator — Test utility for network degradation simulation
 *
 * Provides configurable network conditions for integration tests:
 * - Latency injection (min/max range)
 * - Packet loss (configurable drop rate)
 * - Disconnect simulation (after N ms)
 * - Reconnect storms (rapid connect/disconnect cycles)
 *
 * NOT for production use — test-only utility.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface NetworkCondition {
  latencyMs?: { min: number; max: number };
  dropRate?: number; // 0-1, fraction of requests to drop
  disconnectAfterMs?: number;
  maxConcurrent?: number;
}

export interface SimulatedRequest<T> {
  execute: () => Promise<T>;
  condition: NetworkCondition;
}

export interface SimulationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  latencyMs: number;
  dropped: boolean;
}

// ── Simulators ───────────────────────────────────────────────────────

/**
 * Simulate network latency by delaying execution.
 */
export function simulateLatency(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

/**
 * Simulate packet loss — returns true if the request should be dropped.
 */
export function simulatePacketLoss(dropRate: number): boolean {
  return Math.random() < dropRate;
}

/**
 * Execute a request with simulated network conditions.
 */
export async function executeWithConditions<T>(
  fn: () => Promise<T>,
  condition: NetworkCondition
): Promise<SimulationResult<T>> {
  const start = Date.now();

  // Simulate packet loss
  if (condition.dropRate && simulatePacketLoss(condition.dropRate)) {
    return {
      success: false,
      error: "NETWORK_DROP",
      latencyMs: 0,
      dropped: true,
    };
  }

  // Simulate latency
  if (condition.latencyMs) {
    const delay = simulateLatency(condition.latencyMs.min, condition.latencyMs.max);
    await new Promise((r) => setTimeout(r, delay));
  }

  // Simulate disconnect
  if (condition.disconnectAfterMs) {
    const elapsed = Date.now() - start;
    if (elapsed >= condition.disconnectAfterMs) {
      return {
        success: false,
        error: "DISCONNECTED",
        latencyMs: elapsed,
        dropped: false,
      };
    }
  }

  try {
    const result = await fn();
    return {
      success: true,
      result,
      latencyMs: Date.now() - start,
      dropped: false,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
      latencyMs: Date.now() - start,
      dropped: false,
    };
  }
}

/**
 * Simulate a reconnect storm: rapid connect/disconnect cycles.
 * Returns the number of successful connections.
 */
export async function simulateReconnectStorm(
  connectFn: () => Promise<boolean>,
  cycles: number,
  intervalMs: number = 100
): Promise<{ successCount: number; failCount: number; totalMs: number }> {
  const start = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < cycles; i++) {
    try {
      const result = await connectFn();
      if (result) successCount++;
      else failCount++;
    } catch {
      failCount++;
    }
    if (i < cycles - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    successCount,
    failCount,
    totalMs: Date.now() - start,
  };
}

/**
 * Create a degraded network condition preset.
 */
export const NETWORK_PRESETS = {
  /** Good network: minimal latency, no drops */
  good: { latencyMs: { min: 10, max: 50 }, dropRate: 0 },
  /** Fair network: moderate latency, rare drops */
  fair: { latencyMs: { min: 100, max: 500 }, dropRate: 0.02 },
  /** Poor network: high latency, occasional drops */
  poor: { latencyMs: { min: 500, max: 2000 }, dropRate: 0.1 },
  /** Terrible network: very high latency, frequent drops */
  terrible: { latencyMs: { min: 2000, max: 5000 }, dropRate: 0.3 },
  /** Intermittent: random disconnects */
  intermittent: { latencyMs: { min: 50, max: 200 }, dropRate: 0.5, disconnectAfterMs: 3000 },
} as const;

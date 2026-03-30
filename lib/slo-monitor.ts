/**
 * SLO Monitor — Service Level Objective tracking
 *
 * Records SLO events to Redis sorted sets and computes
 * real-time compliance metrics for interview-critical paths.
 */

// Lazy Redis init (same pattern as session-store.ts)
let redisClient: any = null;

async function getRedis() {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    return null;
  }
}

export interface SLODefinition {
  name: string;
  target: number; // e.g. 0.995 for 99.5%
  windowHours: number;
  description: string;
  unit: "rate" | "latency_ms";
  latencyThresholdMs?: number; // For latency SLOs
}

export const SLO_DEFINITIONS: SLODefinition[] = [
  {
    name: "interview.start.success_rate",
    target: 0.999,
    windowHours: 24,
    description: "Interview session start success rate (≥99.9%)",
    unit: "rate",
  },
  {
    name: "transcript.checkpoint.latency_p99",
    target: 0.995,
    windowHours: 24,
    description: "Transcript checkpoint latency under 500ms (≥99.5%)",
    unit: "latency_ms",
    latencyThresholdMs: 500,
  },
  {
    name: "report.generation.time_p95",
    target: 0.95,
    windowHours: 24,
    description: "Report generation under 120 seconds",
    unit: "latency_ms",
    latencyThresholdMs: 120000,
  },
  {
    name: "recording.upload.success_rate",
    target: 0.995,
    windowHours: 24,
    description: "Recording chunk upload success rate (≥99.5%)",
    unit: "rate",
  },
  {
    name: "session.reconnect.success_rate",
    target: 0.999,
    windowHours: 24,
    description: "WebSocket reconnect success rate (≥99.9%)",
    unit: "rate",
  },
  {
    name: "session.hard_stop.rate",
    target: 0.9975,
    windowHours: 24,
    description: "Session non-hard-stop rate (≤0.25% hard stops)",
    unit: "rate",
  },
  {
    name: "session.30min_completion.rate",
    target: 0.995,
    windowHours: 24,
    description: "30-minute session completion rate (≥99.5%)",
    unit: "rate",
  },
  {
    name: "session.reconnect.context_loss.rate",
    target: 0.999,
    windowHours: 24,
    description: "Post-reconnect context preservation rate (≤0.1% loss)",
    unit: "rate",
  },
  {
    name: "session.reconnect.latency_p95",
    target: 0.95,
    windowHours: 24,
    description: "Reconnect time under 15 seconds (p95)",
    unit: "latency_ms",
    latencyThresholdMs: 15000,
  },
  {
    name: "transcript.anomaly.rate",
    target: 0.995,
    windowHours: 24,
    description: "Transcript anomaly rate (≤0.5% anomalies)",
    unit: "rate",
  },
  {
    name: "session.heartbeat.failure_rate",
    target: 0.999,
    windowHours: 24,
    description: "Session heartbeat success rate (≥99.9%)",
    unit: "rate",
  },
  {
    name: "gate.repeated_intro.rate",
    target: 0.999,
    windowHours: 24,
    description: "AI re-introduction suppression rate (≤0.1% repeat intros)",
    unit: "rate",
  },
  {
    name: "gate.unsupported_claim.rate",
    target: 0.995,
    windowHours: 24,
    description: "AI hallucinated reference prevention rate (≤0.5% unsupported claims)",
    unit: "rate",
  },
  {
    name: "session.context_reset.rate",
    target: 0.999,
    windowHours: 24,
    description: "Context preservation across reconnects (≤0.1% full resets)",
    unit: "rate",
  },
  {
    name: "session.turn_commit.success_rate",
    target: 0.999,
    windowHours: 24,
    description: "Turn-commit protocol success rate (≥99.9%)",
    unit: "rate",
  },
  {
    name: "session.turn_commit.latency_p99",
    target: 0.99,
    windowHours: 24,
    description: "Turn-commit p99 latency under 2s (≥99%)",
    unit: "rate",
  },
  {
    name: "memory.contradiction.detection_rate",
    target: 0.995,
    windowHours: 24,
    description: "Semantic contradiction detection rate (≥99.5%)",
    unit: "rate",
  },
  {
    name: "memory.fidelity.recall_rate",
    target: 0.95,
    windowHours: 24,
    description: "Memory fidelity recall rate (≥95%)",
    unit: "rate",
  },
];

/**
 * Record an SLO event (success or failure).
 * For latency SLOs, success is determined by whether durationMs is under threshold.
 */
export async function recordSLOEvent(
  sloName: string,
  success: boolean,
  durationMs?: number
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const now = Date.now();
    const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `slo:${sloName}:${dateKey}`;

    // Store as score=timestamp, member="{success}:{durationMs}:{uuid}"
    const uuid = Math.random().toString(36).slice(2, 10);
    const member = `${success ? 1 : 0}:${durationMs ?? 0}:${uuid}`;

    await redis.zadd(key, { score: now, member });
    // Set TTL to 48 hours to cover the SLO window plus buffer
    await redis.expire(key, 48 * 3600);
  } catch (err) {
    console.warn(`[SLO] Failed to record event for ${sloName}:`, err);
  }
}

export interface SLOStatus {
  name: string;
  description: string;
  target: number;
  current: number;
  totalEvents: number;
  successEvents: number;
  errorBudgetRemaining: number; // percentage of allowed failures remaining
  breached: boolean;
}

/**
 * Get current SLO status for a specific SLO.
 */
export async function getSLOStatus(sloName: string): Promise<SLOStatus | null> {
  const def = SLO_DEFINITIONS.find((d) => d.name === sloName);
  if (!def) return null;

  const redis = await getRedis();
  if (!redis) {
    return {
      name: sloName,
      description: def.description,
      target: def.target,
      current: 1,
      totalEvents: 0,
      successEvents: 0,
      errorBudgetRemaining: 100,
      breached: false,
    };
  }

  try {
    // Query events from the window
    const now = Date.now();
    const windowStart = now - def.windowHours * 3600 * 1000;

    // Get today and yesterday's keys (covers 24h window)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

    const [todayMembers, yesterdayMembers] = await Promise.all([
      redis.zrangebyscore(`slo:${sloName}:${today}`, windowStart, now) as Promise<string[]>,
      redis.zrangebyscore(`slo:${sloName}:${yesterday}`, windowStart, now) as Promise<string[]>,
    ]);

    const allMembers = [...(todayMembers || []), ...(yesterdayMembers || [])];
    const totalEvents = allMembers.length;

    if (totalEvents === 0) {
      return {
        name: sloName,
        description: def.description,
        target: def.target,
        current: 1,
        totalEvents: 0,
        successEvents: 0,
        errorBudgetRemaining: 100,
        breached: false,
      };
    }

    const successEvents = allMembers.filter((m: string) => m.startsWith("1:")).length;
    const current = successEvents / totalEvents;

    // Error budget: how much of the allowed failure rate remains
    const allowedFailureRate = 1 - def.target;
    const actualFailureRate = 1 - current;
    const errorBudgetRemaining = allowedFailureRate > 0
      ? Math.max(0, ((allowedFailureRate - actualFailureRate) / allowedFailureRate) * 100)
      : (actualFailureRate === 0 ? 100 : 0);

    return {
      name: sloName,
      description: def.description,
      target: def.target,
      current,
      totalEvents,
      successEvents,
      errorBudgetRemaining,
      breached: current < def.target,
    };
  } catch (err) {
    console.warn(`[SLO] Failed to get status for ${sloName}:`, err);
    return null;
  }
}

/**
 * Check all SLOs and return a full report.
 */
export async function checkAllSLOs(): Promise<SLOStatus[]> {
  const results: SLOStatus[] = [];
  for (const def of SLO_DEFINITIONS) {
    const status = await getSLOStatus(def.name);
    if (status) results.push(status);
  }
  return results;
}

/**
 * Persist a daily SLO snapshot for long-term trend analysis.
 * Stores a rollup of all SLO statuses keyed by date. Retained for 90 days.
 */
export async function persistSLOSnapshot(): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const statuses = await checkAllSLOs();
    const dateKey = new Date().toISOString().slice(0, 10);
    const snapshot = {
      date: dateKey,
      generatedAt: new Date().toISOString(),
      slos: statuses.map((s) => ({
        name: s.name,
        current: s.current,
        target: s.target,
        totalEvents: s.totalEvents,
        successEvents: s.successEvents,
        breached: s.breached,
        errorBudgetRemaining: s.errorBudgetRemaining,
      })),
    };

    await redis.set(`slo-snapshot:${dateKey}`, JSON.stringify(snapshot), { ex: 90 * 86400 });
  } catch (err) {
    console.warn("[SLO] Failed to persist snapshot:", err);
  }
}

/**
 * Retrieve SLO trend history for the last N days.
 */
export async function getSLOTrend(days: number = 30): Promise<Array<{
  date: string;
  slos: Array<{
    name: string;
    current: number;
    target: number;
    breached: boolean;
    errorBudgetRemaining: number;
  }>;
}>> {
  const redis = await getRedis();
  if (!redis) return [];

  const results: Array<{ date: string; slos: Array<{ name: string; current: number; target: number; breached: boolean; errorBudgetRemaining: number }> }> = [];
  const now = Date.now();

  for (let i = 0; i < days; i++) {
    const date = new Date(now - i * 86400000).toISOString().slice(0, 10);
    try {
      const data = await redis.get(`slo-snapshot:${date}`);
      if (data) {
        results.push(typeof data === "string" ? JSON.parse(data) : data);
      }
    } catch { /* skip missing days */ }
  }

  return results.reverse();
}

/**
 * Check SLOs and alert via Sentry if any are breached.
 */
export async function checkAndAlertSLOs(): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    const statuses = await checkAllSLOs();

    for (const status of statuses) {
      if (status.totalEvents === 0) continue;

      if (status.breached) {
        if (status.errorBudgetRemaining <= 0) {
          Sentry.captureMessage(
            `[SLO BREACH] ${status.name}: ${(status.current * 100).toFixed(1)}% (target: ${(status.target * 100).toFixed(1)}%) — error budget exhausted`,
            "error"
          );
        } else if (status.errorBudgetRemaining < 10) {
          Sentry.captureMessage(
            `[SLO WARNING] ${status.name}: ${(status.current * 100).toFixed(1)}% (target: ${(status.target * 100).toFixed(1)}%) — ${status.errorBudgetRemaining.toFixed(0)}% error budget remaining`,
            "warning"
          );
        }
      }

      // Add as breadcrumb for context
      Sentry.addBreadcrumb({
        category: "slo",
        message: `${status.name}: ${(status.current * 100).toFixed(1)}% (${status.totalEvents} events)`,
        level: status.breached ? "warning" : "info",
      });
    }
  } catch (err) {
    console.error("[SLO] Alert check failed:", err);
  }
}

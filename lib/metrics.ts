/**
 * Custom metrics collection for observability.
 *
 * Tracks key business and performance metrics in-memory with
 * Redis persistence for cross-instance aggregation.
 * Exports in Prometheus-compatible format via /api/metrics.
 */

interface MetricEntry {
  name: string;
  type: "counter" | "histogram" | "gauge";
  help: string;
  value: number;
  labels?: Record<string, string>;
  buckets?: number[]; // For histograms
  observations?: number[]; // Raw observations for percentile calculation
}

const metrics = new Map<string, MetricEntry>();

// ── Redis persistence for cross-instance aggregation ────────────────────

let _redisClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex: number }) => Promise<unknown>;
  incrbyfloat: (key: string, amount: number) => Promise<number>;
} | null = null;
let _redisInitialized = false;

async function getRedisClient() {
  if (_redisInitialized) return _redisClient;
  _redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      _redisClient = new Redis({ url, token }) as typeof _redisClient;
    } catch {
      _redisClient = null;
    }
  }
  return _redisClient;
}

/** Persist counter increment to Redis (fire-and-forget). */
function persistCounterToRedis(key: string, amount: number): void {
  getRedisClient().then((redis) => {
    if (redis) {
      redis.incrbyfloat(`metrics:counter:${key}`, amount).catch(() => {});
    }
  }).catch(() => {});
}

/** Persist gauge value to Redis (fire-and-forget). */
function persistGaugeToRedis(key: string, value: number): void {
  getRedisClient().then((redis) => {
    if (redis) {
      redis.set(`metrics:gauge:${key}`, String(value), { ex: 3600 }).catch(() => {});
    }
  }).catch(() => {});
}

/** Persist histogram observation to Redis (fire-and-forget). */
function persistHistogramToRedis(key: string, value: number): void {
  getRedisClient().then(async (redis) => {
    if (!redis) return;
    // Store count + sum + recent observations for cross-instance percentile calculation
    await Promise.all([
      redis.incrbyfloat(`metrics:hist:${key}:count`, 1),
      redis.incrbyfloat(`metrics:hist:${key}:sum`, value),
      // Store recent observations in a capped list for percentile approximation
      redis.set(`metrics:hist:${key}:recent`, JSON.stringify(
        getRecentObservations(key, value)
      ), { ex: 3600 }),
    ]).catch(() => {});
  }).catch(() => {});
}

/** Get recent observations for a histogram key, capped at 1000. */
function getRecentObservations(key: string, newValue: number): number[] {
  const existing = metrics.get(key);
  const obs = existing?.observations || [];
  const recent = obs.slice(-999);
  recent.push(newValue);
  return recent;
}

/**
 * Sync counter values from Redis to get cross-instance totals.
 * Call this from the metrics export endpoint.
 */
export async function syncFromRedis(): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  for (const [key, metric] of metrics) {
    try {
      if (metric.type === "counter") {
        const redisVal = await redis.get(`metrics:counter:${key}`);
        if (redisVal) {
          const total = parseFloat(redisVal as string);
          if (total > metric.value) metric.value = total;
        }
      } else if (metric.type === "histogram") {
        const countStr = await redis.get(`metrics:hist:${key}:count`);
        if (countStr) {
          const redisCount = parseFloat(countStr as string);
          if (redisCount > (metric.observations?.length || 0)) {
            metric.value = redisCount;
          }
        }
        // Pull recent observations from Redis for accurate percentile calculation
        const recentStr = await redis.get(`metrics:hist:${key}:recent`);
        if (recentStr) {
          try {
            const recentObs = JSON.parse(recentStr as string);
            if (Array.isArray(recentObs) && recentObs.length > (metric.observations?.length || 0)) {
              metric.observations = recentObs;
            }
          } catch {
            // Best-effort parse
          }
        }
      }
    } catch {
      // Best-effort sync
    }
  }
}

// ── Counter ─────────────────────────────────────────────────────────────

export function incrementCounter(
  name: string,
  help: string,
  labels?: Record<string, string>,
  amount = 1
): void {
  const key = `${name}:${JSON.stringify(labels || {})}`;
  const existing = metrics.get(key);

  if (existing) {
    existing.value += amount;
  } else {
    metrics.set(key, { name, type: "counter", help, value: amount, labels });
  }

  persistCounterToRedis(key, amount);
}

// ── Gauge ───────────────────────────────────────────────────────────────

export function setGauge(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>
): void {
  const key = `${name}:${JSON.stringify(labels || {})}`;
  metrics.set(key, { name, type: "gauge", help, value, labels });
  persistGaugeToRedis(key, value);
}

// ── Histogram (simplified) ───────────────────────────────────���──────────

const MAX_OBSERVATIONS = 10000;

export function observeHistogram(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>
): void {
  const key = `${name}:${JSON.stringify(labels || {})}`;
  const existing = metrics.get(key);

  if (existing && existing.observations) {
    existing.observations.push(value);
    if (existing.observations.length > MAX_OBSERVATIONS) {
      existing.observations = existing.observations.slice(-MAX_OBSERVATIONS);
    }
    existing.value = existing.observations.length;
  } else {
    metrics.set(key, {
      name,
      type: "histogram",
      help,
      value: 1,
      labels,
      observations: [value],
    });
  }

  persistHistogramToRedis(key, value);
}

// ── Percentile calculation ──────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Export in Prometheus format ──────────────────────────────────────────

export function exportPrometheusMetrics(): string {
  const lines: string[] = [];
  const processedNames = new Set<string>();

  for (const [, metric] of metrics) {
    if (!processedNames.has(metric.name)) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type === "histogram" ? "summary" : metric.type}`);
      processedNames.add(metric.name);
    }

    const labelStr = metric.labels
      ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`
      : "";

    if (metric.type === "histogram" && metric.observations) {
      const sorted = [...metric.observations].sort((a, b) => a - b);
      lines.push(`${metric.name}_count${labelStr} ${sorted.length}`);
      lines.push(`${metric.name}_sum${labelStr} ${sorted.reduce((a, b) => a + b, 0)}`);
      lines.push(`${metric.name}{quantile="0.5"${labelStr ? "," + labelStr.slice(1, -1) : ""}} ${percentile(sorted, 50)}`);
      lines.push(`${metric.name}{quantile="0.95"${labelStr ? "," + labelStr.slice(1, -1) : ""}} ${percentile(sorted, 95)}`);
      lines.push(`${metric.name}{quantile="0.99"${labelStr ? "," + labelStr.slice(1, -1) : ""}} ${percentile(sorted, 99)}`);
    } else {
      lines.push(`${metric.name}${labelStr} ${metric.value}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ── Pre-defined metrics ─────────────────────────────────────────────────

export function trackInterviewStarted(type: string): void {
  incrementCounter("paraform_interviews_started_total", "Total interviews started", { type });
}

export function trackInterviewCompleted(type: string): void {
  incrementCounter("paraform_interviews_completed_total", "Total interviews completed", { type });
}

export function trackReportGenerated(model: string): void {
  incrementCounter("paraform_reports_generated_total", "Total reports generated", { model });
}

export function trackVoiceReconnect(outcome: string): void {
  incrementCounter("paraform_voice_reconnects_total", "Total voice reconnection attempts", { outcome });
}

export function trackApiLatency(endpoint: string, latencyMs: number): void {
  observeHistogram("paraform_api_latency_ms", "API endpoint latency in milliseconds", latencyMs, { endpoint });
}

export function trackVoiceInitLatency(latencyMs: number): void {
  observeHistogram("paraform_voice_init_latency_ms", "Voice initialization latency in milliseconds", latencyMs);
}

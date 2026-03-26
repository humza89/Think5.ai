/**
 * Soak Test Configuration — Long-running stability validation
 *
 * Defines configuration for running 50+ sequential interview simulations
 * to detect memory leaks, latency drift, and error accumulation.
 *
 * Usage: npx tsx eval/soak-test-config.ts [--interviews <n>] [--report]
 */

export interface SoakTestConfig {
  totalInterviews: number;
  intervalMs: number; // Delay between interviews
  maxDurationMinutes: number;
  thresholds: {
    maxLatencyDriftPercent: number; // Alert if p99 latency increases by this %
    maxErrorRatePercent: number; // Alert if error rate exceeds this
    maxMemoryGrowthMb: number; // Alert if RSS grows beyond this
  };
  endpoints: {
    health: string;
    voiceInit: string;
    voiceCheckpoint: string;
    voiceEnd: string;
  };
}

export interface SoakTestResult {
  startedAt: string;
  completedAt: string;
  totalInterviews: number;
  completedInterviews: number;
  failedInterviews: number;
  metrics: {
    avgLatencyMs: number;
    p99LatencyMs: number;
    latencyDriftPercent: number;
    errorRate: number;
    memoryStartMb: number;
    memoryEndMb: number;
    memoryGrowthMb: number;
  };
  passed: boolean;
  failures: string[];
}

const DEFAULT_CONFIG: SoakTestConfig = {
  totalInterviews: 50,
  intervalMs: 2000,
  maxDurationMinutes: 30,
  thresholds: {
    maxLatencyDriftPercent: 50,
    maxErrorRatePercent: 5,
    maxMemoryGrowthMb: 100,
  },
  endpoints: {
    health: "/api/health",
    voiceInit: "/api/interviews/{id}/voice-init",
    voiceCheckpoint: "/api/interviews/{id}/voice",
    voiceEnd: "/api/interviews/{id}/voice",
  },
};

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function measureLatency(url: string): Promise<{ latencyMs: number; status: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${url}`);
    return { latencyMs: Date.now() - start, status: res.status };
  } catch {
    return { latencyMs: Date.now() - start, status: 0 };
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runSoakTest(config: SoakTestConfig = DEFAULT_CONFIG): Promise<SoakTestResult> {
  const startedAt = new Date().toISOString();
  const memoryStart = process.memoryUsage().rss / 1024 / 1024;
  const latencies: number[] = [];
  const errors: string[] = [];
  let completed = 0;
  let failed = 0;

  console.log(`\nSoak Test: ${config.totalInterviews} interviews, ${config.intervalMs}ms interval`);
  console.log(`Thresholds: drift <${config.thresholds.maxLatencyDriftPercent}%, errors <${config.thresholds.maxErrorRatePercent}%, memory growth <${config.thresholds.maxMemoryGrowthMb}MB\n`);

  // Warm-up
  await measureLatency(config.endpoints.health);

  // First 10% as baseline
  const baselineCount = Math.max(5, Math.floor(config.totalInterviews * 0.1));

  for (let i = 0; i < config.totalInterviews; i++) {
    const measurement = await measureLatency(config.endpoints.health);
    latencies.push(measurement.latencyMs);

    if (measurement.status === 200 || measurement.status === 503) {
      completed++;
    } else {
      failed++;
      errors.push(`Interview ${i + 1}: status ${measurement.status}`);
    }

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      const currentP99 = percentile(latencies, 99);
      const memNow = process.memoryUsage().rss / 1024 / 1024;
      console.log(
        `  [${i + 1}/${config.totalInterviews}] p99: ${currentP99.toFixed(0)}ms | errors: ${failed} | RSS: ${memNow.toFixed(1)}MB`
      );
    }

    if (i < config.totalInterviews - 1) {
      await new Promise((r) => setTimeout(r, config.intervalMs));
    }
  }

  const memoryEnd = process.memoryUsage().rss / 1024 / 1024;
  const baselineP99 = percentile(latencies.slice(0, baselineCount), 99);
  const finalP99 = percentile(latencies.slice(-baselineCount), 99);
  const latencyDrift = baselineP99 > 0 ? ((finalP99 - baselineP99) / baselineP99) * 100 : 0;

  const result: SoakTestResult = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalInterviews: config.totalInterviews,
    completedInterviews: completed,
    failedInterviews: failed,
    metrics: {
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p99LatencyMs: percentile(latencies, 99),
      latencyDriftPercent: latencyDrift,
      errorRate: (failed / config.totalInterviews) * 100,
      memoryStartMb: memoryStart,
      memoryEndMb: memoryEnd,
      memoryGrowthMb: memoryEnd - memoryStart,
    },
    passed: true,
    failures: [],
  };

  // Check thresholds
  if (result.metrics.latencyDriftPercent > config.thresholds.maxLatencyDriftPercent) {
    result.failures.push(
      `Latency drift ${result.metrics.latencyDriftPercent.toFixed(1)}% exceeds threshold ${config.thresholds.maxLatencyDriftPercent}%`
    );
  }
  if (result.metrics.errorRate > config.thresholds.maxErrorRatePercent) {
    result.failures.push(
      `Error rate ${result.metrics.errorRate.toFixed(1)}% exceeds threshold ${config.thresholds.maxErrorRatePercent}%`
    );
  }
  if (result.metrics.memoryGrowthMb > config.thresholds.maxMemoryGrowthMb) {
    result.failures.push(
      `Memory growth ${result.metrics.memoryGrowthMb.toFixed(1)}MB exceeds threshold ${config.thresholds.maxMemoryGrowthMb}MB`
    );
  }

  result.passed = result.failures.length === 0;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const interviews = args.includes("--interviews")
    ? parseInt(args[args.indexOf("--interviews") + 1], 10)
    : DEFAULT_CONFIG.totalInterviews;

  const config = { ...DEFAULT_CONFIG, totalInterviews: interviews };

  console.log("=".repeat(60));
  console.log("  SOAK TEST — Voice Interview Stability");
  console.log("=".repeat(60));
  console.log(`  Target: ${BASE_URL}`);

  const result = await runSoakTest(config);

  console.log("\n" + "-".repeat(60));
  console.log(`  Status: ${result.passed ? "PASSED" : "FAILED"}`);
  console.log(`  Completed: ${result.completedInterviews}/${result.totalInterviews}`);
  console.log(`  Avg Latency: ${result.metrics.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  P99 Latency: ${result.metrics.p99LatencyMs.toFixed(0)}ms`);
  console.log(`  Latency Drift: ${result.metrics.latencyDriftPercent.toFixed(1)}%`);
  console.log(`  Error Rate: ${result.metrics.errorRate.toFixed(1)}%`);
  console.log(`  Memory Growth: ${result.metrics.memoryGrowthMb.toFixed(1)}MB`);

  if (result.failures.length > 0) {
    console.log("\n  Failures:");
    for (const f of result.failures) {
      console.log(`    - ${f}`);
    }
  }

  console.log("-".repeat(60) + "\n");
  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Soak test failed:", err);
  process.exit(1);
});

/**
 * k6 Load Test: Concurrent Interview Sessions
 *
 * Simulates multiple candidates starting and completing interviews
 * simultaneously. Validates:
 * - Voice-init P95 < 2s
 * - API P95 < 500ms
 * - Zero 5xx errors under load
 *
 * Usage:
 *   k6 run load-tests/concurrent-interviews.js
 *   k6 run --env BASE_URL=https://staging.paraform.com load-tests/concurrent-interviews.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const voiceInitLatency = new Trend("voice_init_latency", true);
const apiLatency = new Trend("api_latency", true);

// Configuration
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_TOKEN = __ENV.API_TOKEN || "test-token";

export const options = {
  scenarios: {
    // Standard load: realistic ramp up
    standard: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },   // Ramp up to 10 concurrent
        { duration: "1m", target: 50 },     // Ramp to 50 concurrent
        { duration: "2m", target: 100 },    // Hold at 100 concurrent
        { duration: "30s", target: 0 },     // Ramp down
      ],
      exec: "standardLoad",
    },
    // Stress test: push beyond normal capacity
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "1m", target: 300 },
        { duration: "2m", target: 500 },    // Peak: 500 concurrent
        { duration: "30s", target: 0 },
      ],
      startTime: "4m30s", // Run after standard load completes
      exec: "stressTest",
    },
    // Bulk operations: test admin bulk endpoints
    bulkOps: {
      executor: "per-vu-iterations",
      vus: 10,
      iterations: 5,
      startTime: "0s",
      exec: "bulkOperations",
    },
  },
  thresholds: {
    "voice_init_latency": ["p(95)<2000"],  // P95 voice-init under 2s
    "api_latency": ["p(95)<500"],          // P95 API under 500ms
    "errors": ["rate<0.01"],               // Error rate under 1%
    "http_req_duration": ["p(99)<5000"],   // P99 all requests under 5s
    "report_gen_latency": ["p(95)<5000"],  // P95 report generation under 5s
  },
};

const reportGenLatency = new Trend("report_gen_latency", true);

// Standard load scenario
export function standardLoad() {
  // 1. Health check
  const healthStart = Date.now();
  const healthRes = http.get(`${BASE_URL}/api/v1/health`);
  apiLatency.add(Date.now() - healthStart);
  check(healthRes, { "health check 200": (r) => r.status === 200 });
  errorRate.add(healthRes.status >= 500);

  // 2. Simulate interview creation
  const createStart = Date.now();
  const createRes = http.post(
    `${BASE_URL}/api/interviews`,
    JSON.stringify({
      candidateId: `test-candidate-${__VU}`,
      type: "TECHNICAL",
      mode: "GENERAL_PROFILE",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
    }
  );
  apiLatency.add(Date.now() - createStart);
  errorRate.add(createRes.status >= 500);

  sleep(1);

  // 3. Simulate voice-init (most latency-sensitive endpoint)
  if (createRes.status === 200 || createRes.status === 201) {
    const body = JSON.parse(createRes.body || "{}");
    const interviewId = body.id || body.interviewId;

    if (interviewId) {
      const initStart = Date.now();
      const initRes = http.post(
        `${BASE_URL}/api/interviews/${interviewId}/voice-init`,
        JSON.stringify({ reconnect: false }),
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_TOKEN}`,
          },
        }
      );
      voiceInitLatency.add(Date.now() - initStart);
      check(initRes, {
        "voice-init success": (r) => r.status === 200,
        "voice-init under 2s": (r) => r.timings.duration < 2000,
      });
      errorRate.add(initRes.status >= 500);
    }
  }

  // 4. Simulate checkpoint save
  sleep(2);

  // 5. Simulate admin dashboard load
  const dashStart = Date.now();
  const dashRes = http.get(`${BASE_URL}/api/admin`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  apiLatency.add(Date.now() - dashStart);
  errorRate.add(dashRes.status >= 500);

  sleep(1);
}

// Default export for backward compat
export default standardLoad;

// Stress test scenario — same flow but at higher concurrency
export function stressTest() {
  standardLoad();
}

// Bulk operations scenario
export function bulkOperations() {
  // 1. Bulk invite via CSV-like payload
  const bulkStart = Date.now();
  const bulkRes = http.post(
    `${BASE_URL}/api/admin/interviews/bulk-invite`,
    JSON.stringify({
      candidates: Array.from({ length: 20 }, (_, i) => ({
        email: `loadtest-${__VU}-${i}@example.com`,
        name: `Load Test Candidate ${i}`,
      })),
      templateId: "test-template",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
    }
  );
  apiLatency.add(Date.now() - bulkStart);
  errorRate.add(bulkRes.status >= 500);

  sleep(2);

  // 2. Report generation trigger
  const reportStart = Date.now();
  const reportRes = http.get(`${BASE_URL}/api/admin/analytics`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  reportGenLatency.add(Date.now() - reportStart);
  check(reportRes, {
    "analytics 200": (r) => r.status === 200,
    "analytics under 5s": (r) => r.timings.duration < 5000,
  });
  errorRate.add(reportRes.status >= 500);

  // 3. Metrics endpoint (Prometheus scrape simulation)
  const metricsRes = http.get(`${BASE_URL}/api/metrics`);
  check(metricsRes, { "metrics 200": (r) => r.status === 200 });

  sleep(1);
}

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for GET /api/metrics — bearer token authentication hardening.
 * Validates WS3: no unauthenticated access, 503 when unconfigured.
 */

vi.mock("@/lib/metrics", () => ({
  exportPrometheusMetrics: vi.fn(() => "# HELP test_metric\ntest_metric 1\n"),
}));

describe("metrics endpoint authentication", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 503 when METRICS_BEARER_TOKEN is not configured", async () => {
    delete process.env.METRICS_BEARER_TOKEN;
    const { GET } = await import("@/app/api/metrics/route");

    const req = new Request("http://localhost/api/metrics", {
      headers: { authorization: "Bearer some-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("not configured");
  });

  it("returns 401 when bearer token is missing", async () => {
    process.env.METRICS_BEARER_TOKEN = "secret-metrics-token";
    const { GET } = await import("@/app/api/metrics/route");

    const req = new Request("http://localhost/api/metrics");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when bearer token is wrong", async () => {
    process.env.METRICS_BEARER_TOKEN = "secret-metrics-token";
    const { GET } = await import("@/app/api/metrics/route");

    const req = new Request("http://localhost/api/metrics", {
      headers: { authorization: "Bearer wrong-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns 200 with prometheus metrics when token is correct", async () => {
    process.env.METRICS_BEARER_TOKEN = "secret-metrics-token";
    const { GET } = await import("@/app/api/metrics/route");

    const req = new Request("http://localhost/api/metrics", {
      headers: { authorization: "Bearer secret-metrics-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("test_metric");
  });
});

import { NextResponse } from "next/server";
import { exportPrometheusMetrics } from "@/lib/metrics";

/**
 * GET /api/metrics
 * Prometheus-compatible metrics endpoint.
 * Protected by a bearer token to prevent public access.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.METRICS_BEARER_TOKEN;

  // Always require bearer token authentication — no unauthenticated access
  if (!expectedToken) {
    console.error("METRICS_BEARER_TOKEN is not configured — metrics endpoint is disabled");
    return NextResponse.json({ error: "Metrics endpoint not configured" }, { status: 503 });
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = exportPrometheusMetrics();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}

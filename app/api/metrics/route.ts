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

  // If token is configured, require it
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = exportPrometheusMetrics();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}

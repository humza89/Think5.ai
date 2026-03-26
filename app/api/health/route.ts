import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public Health Check Endpoint
 *
 * SECURITY: Only returns service availability status.
 * Sensitive metrics (interview counts, storage, SLOs) are
 * available via /api/admin/reliability (admin-authenticated).
 */
export async function GET() {
  const checks: Record<string, string> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "healthy";
  } catch {
    checks.database = "unhealthy";
  }

  // Redis check
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url, token });
      await redis.ping();
      checks.redis = "healthy";
    } else {
      checks.redis = "not_configured";
    }
  } catch {
    checks.redis = "unhealthy";
  }

  const dbHealthy = checks.database === "healthy";

  return NextResponse.json(
    {
      status: dbHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: checks.database,
        redis: checks.redis,
      },
    },
    { status: dbHealthy ? 200 : 503 }
  );
}

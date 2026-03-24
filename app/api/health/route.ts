import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // R2/S3 storage check
  checks.storage = (process.env.R2_ENDPOINT || process.env.AWS_ACCESS_KEY_ID) ? "configured" : "not_configured";

  // Environment check
  checks.supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing";
  checks.openai = process.env.OPENAI_API_KEY ? "configured" : "missing";
  checks.resend = process.env.RESEND_API_KEY ? "configured" : "missing";

  // SLO status
  let sloStatus: unknown[] = [];
  try {
    const { checkAllSLOs } = await import("@/lib/slo-monitor");
    sloStatus = await checkAllSLOs();
  } catch {
    // SLO monitoring not available
  }

  const allHealthy = checks.database === "healthy";

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      slos: sloStatus,
    },
    { status: allHealthy ? 200 : 503 }
  );
}

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

  // Recording storage metrics
  let storageMetrics: Record<string, unknown> = {};
  try {
    const recordingCount = await prisma.interview.count({
      where: { recordingUrl: { not: null } },
    });
    const totalInterviews = await prisma.interview.count();
    storageMetrics = {
      totalInterviews,
      recordingsCount: recordingCount,
      estimatedStorageGb: +(recordingCount * 0.05).toFixed(2), // ~50MB per recording
      estimatedMonthlyCostUsd: +(recordingCount * 0.05 * 0.015).toFixed(4), // $0.015/GB R2
    };
  } catch {
    storageMetrics = { error: "unable_to_query" };
  }

  // SLO status
  let sloStatus: unknown[] = [];
  try {
    const { checkAllSLOs } = await import("@/lib/slo-monitor");
    sloStatus = await checkAllSLOs();
  } catch {
    // SLO monitoring not available
  }

  // Detect SLO breaches
  const sloBreaches = (sloStatus as Array<{ breached?: boolean; name?: string; current?: number; target?: number }>)
    .filter((s) => s.breached)
    .map((s) => ({ name: s.name, current: s.current, target: s.target }));

  const dbHealthy = checks.database === "healthy";
  const hasSloBreaches = sloBreaches.length > 0;
  const allHealthy = dbHealthy && !hasSloBreaches;

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      storage: storageMetrics,
      slos: sloStatus,
      sloBreaches,
    },
    { status: allHealthy ? 200 : 503 }
  );
}

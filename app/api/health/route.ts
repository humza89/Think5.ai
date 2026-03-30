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

  // Redis check — full write/read round-trip verification
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url, token });
      const testKey = `health-check:${Date.now()}`;
      await redis.set(testKey, "ok", { ex: 10 });
      const val = await redis.get(testKey);
      await redis.del(testKey);
      checks.redis = val === "ok" ? "healthy" : "degraded";
    } else {
      checks.redis = "not_configured";
    }
  } catch {
    checks.redis = "unhealthy";
  }

  // Gemini API connectivity check (lightweight — models list)
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      checks.gemini = res.ok ? "healthy" : "unhealthy";
    } else {
      checks.gemini = "not_configured";
    }
  } catch {
    checks.gemini = "unhealthy";
  }

  // Inngest connectivity check — send a test event to verify connectivity
  try {
    const inngestKey = process.env.INNGEST_EVENT_KEY;
    if (inngestKey) {
      const { inngest } = await import("@/inngest/client");
      // Send a no-op health check event (no function listens for this)
      await inngest.send({
        name: "health/ping",
        data: { timestamp: Date.now() },
      });
      checks.inngest = "healthy";
    } else {
      checks.inngest = "not_configured";
    }
  } catch {
    checks.inngest = "unhealthy";
  }

  // Voice relay health check
  try {
    const relayUrl = process.env.VOICE_RELAY_URL;
    if (relayUrl) {
      const relayHealthUrl = relayUrl.replace(/\/ws$/, "").replace("wss://", "https://") + "/health";
      const res = await fetch(relayHealthUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        checks.relay = data.status === "healthy" ? "healthy" : "degraded";
      } else {
        checks.relay = "unhealthy";
      }
    } else {
      checks.relay = "not_configured";
    }
  } catch {
    checks.relay = "unhealthy";
  }

  const dbHealthy = checks.database === "healthy";
  const allHealthy = Object.values(checks).every(
    (v) => v === "healthy" || v === "configured" || v === "not_configured"
  );

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : dbHealthy ? "degraded" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks: {
        database: checks.database,
        redis: checks.redis,
        gemini: checks.gemini,
        inngest: checks.inngest,
        relay: checks.relay,
      },
    },
    { status: dbHealthy ? 200 : 503 }
  );
}

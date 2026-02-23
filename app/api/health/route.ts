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

  // Environment check
  checks.supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing";
  checks.openai = process.env.OPENAI_API_KEY ? "configured" : "missing";
  checks.resend = process.env.RESEND_API_KEY ? "configured" : "missing";

  const allHealthy = checks.database === "healthy";

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}

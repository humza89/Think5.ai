import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/integrations/greenhouse/webhook?integration=<id> (T15 Step 5)
 * Greenhouse signs the raw body (HMAC-SHA256, header `Signature: sha256 <hex>`).
 * The adapter verifies it; events are deduplicated by a body digest and
 * applied through the sync engine, each delivery recorded in ATSSyncRun.
 * Unsigned or unknown integrations get 401/404; a verified body is always 200
 * so Greenhouse does not retry a delivery we chose to skip.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = await checkRateLimit(`gh-webhook:${ip}`, { maxRequests: 600, windowMs: 60_000 });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const integrationId = request.nextUrl.searchParams.get("integration");
  if (!integrationId) return NextResponse.json({ error: "integration query parameter is required" }, { status: 400 });
  const integration = await prisma.aTSIntegration.findUnique({ where: { id: integrationId }, select: { id: true, enabled: true, provider: true, webhookSecret: true } });
  if (!integration || !integration.enabled || integration.provider !== "greenhouse") return NextResponse.json({ error: "Unknown integration" }, { status: 404 });
  if (!integration.webhookSecret) return NextResponse.json({ error: "Webhook secret not configured for this integration" }, { status: 409 });
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  try {
    const { syncDeps } = await import("@/lib/ats/server");
    const { applyWebhook } = await import("@/lib/ats/sync");
    const outcome = await applyWebhook(await syncDeps(), integration.id, { headers, rawBody });
    if (!outcome.accepted) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    return NextResponse.json({ received: true, applied: outcome.applied, deduplicated: outcome.deduplicated });
  } catch (err) {
    logger.error("[ats] greenhouse webhook failed", err, { integrationId });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

/** Greenhouse pings the endpoint with GET when a webhook is created. */
export async function GET() {
  return NextResponse.json({ ok: true, provider: "greenhouse" });
}

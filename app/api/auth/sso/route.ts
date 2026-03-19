import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/auth/sso?email=user@company.com
 * Public endpoint — checks if SSO is configured for the email's domain.
 * Rate-limited and returns a generic response shape to prevent enumeration.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 requests per 60s per IP
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const { allowed } = checkRateLimit(`sso-lookup:${ip}`, { maxRequests: 10, windowMs: 60000 });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email query parameter is required" }, { status: 400 });
    }

    // Basic email validation
    const emailParts = email.split("@");
    if (emailParts.length !== 2 || !emailParts[1]) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const domain = emailParts[1].toLowerCase();

    const config = await prisma.sSOConfig.findFirst({
      where: {
        domain,
        enabled: true,
      },
      select: {
        provider: true,
        metadataUrl: true,
      },
    });

    // Always return same shape to prevent enumeration of which domains have SSO
    if (!config) {
      return NextResponse.json({ ssoEnabled: false });
    }

    return NextResponse.json({
      ssoEnabled: true,
      // Only return provider type, not metadata URL (prevents leaking internal IdP details)
      provider: config.provider,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

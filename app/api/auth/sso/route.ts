import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/sso?email=user@company.com
 * Public endpoint — checks if SSO is configured for the email's domain.
 * Returns { ssoEnabled, provider?, loginUrl? }
 */
export async function GET(request: NextRequest) {
  try {
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
        entityId: true,
      },
    });

    if (!config) {
      return NextResponse.json({ ssoEnabled: false });
    }

    return NextResponse.json({
      ssoEnabled: true,
      provider: config.provider,
      loginUrl: config.metadataUrl || null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

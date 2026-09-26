import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  signReportShareCookie,
  extractClientIp,
  REPORT_COOKIE_TTL_SECONDS,
} from "@/lib/report-share-cookie";

/**
 * POST — verify the recipient email for an email-gated shared report and set
 * the HMAC-signed `report-access-{token}` cookie (see lib/report-share-cookie).
 *
 * CSRF: this is a state-changing /api POST, so the proxy's double-submit
 * cookie check applies (the share page calls it through apiFetch).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Rate limit check — Redis-backed for serverless durability
    const ip = extractClientIp(request.headers);
    const rateLimitResult = await checkRateLimit(`report-verify:${ip}:${token}`, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
    });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Look up the report
    const report = await prisma.interviewReport.findUnique({
      where: { shareToken: token },
      select: {
        recipientEmail: true,
        shareRevoked: true,
        shareExpiresAt: true,
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.shareRevoked) {
      return NextResponse.json({ error: "Access revoked" }, { status: 403 });
    }

    if (report.shareExpiresAt && new Date() > new Date(report.shareExpiresAt)) {
      return NextResponse.json({ error: "Link expired" }, { status: 403 });
    }

    if (!report.recipientEmail) {
      return NextResponse.json({ error: "No email gate on this report" }, { status: 400 });
    }

    // Constant-time comparison of the email hashes.
    const inputHash = createHash("sha256").update(email.toLowerCase().trim()).digest();
    const expectedHash = createHash("sha256")
      .update(report.recipientEmail.toLowerCase().trim())
      .digest();

    if (inputHash.length !== expectedHash.length || !timingSafeEqual(inputHash, expectedHash)) {
      return NextResponse.json({ error: "Email does not match" }, { status: 403 });
    }

    // HMAC-signed cookie with embedded expiry and network binding.
    let cookieValue: string;
    try {
      cookieValue = signReportShareCookie({
        token,
        emailHash: inputHash.toString("hex"),
        ip,
      });
    } catch (err) {
      console.error("Failed to sign report share cookie:", err);
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const cookieStore = await cookies();
    cookieStore.set(`report-access-${token}`, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: REPORT_COOKIE_TTL_SECONDS,
      path: "/",
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

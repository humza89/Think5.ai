import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
// Track 5 Task 21: HMAC-signed cookie + CSRF origin check + shorter TTL.
import {
  signReportShareCookie,
  isSameOriginRequest,
  REPORT_COOKIE_TTL_SECONDS,
} from "@/lib/report-share-cookie";
import { extractClientIp } from "@/lib/candidate-token-security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Track 5 Task 21: CSRF origin check. The old endpoint accepted
    // any cross-origin JSON POST because Next.js doesn't auto-enforce
    // same-origin on Route Handlers. Reject unless Origin matches Host
    // or is in the REPORT_SHARE_ALLOWED_ORIGINS allowlist.
    if (!isSameOriginRequest(request.headers)) {
      return NextResponse.json(
        { error: "Cross-origin request rejected" },
        { status: 403 },
      );
    }

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

    // Track 5 Task 21: constant-time email comparison via hash.
    // We still compare hashes (not plaintext) because the old scheme
    // persisted `recipientEmail` as plaintext and the comparison is
    // performed against that value directly. Hashing both sides and
    // using timingSafeEqual stops a short-string compare side channel.
    const inputHash = createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest();
    const expectedHash = createHash("sha256")
      .update(report.recipientEmail.toLowerCase().trim())
      .digest();

    if (inputHash.length !== expectedHash.length || !timingSafeEqual(inputHash, expectedHash)) {
      return NextResponse.json({ error: "Email does not match" }, { status: 403 });
    }

    // Track 5 Task 21: HMAC-signed cookie (replaces plain SHA256 hash).
    // Cookie format embeds expiry + ipPrefix so a stolen cookie cannot
    // be replayed past 2 hours or from a different /24. See
    // lib/report-share-cookie.ts for the signing contract.
    let cookieValue: string;
    try {
      cookieValue = signReportShareCookie({
        token,
        emailHash: inputHash.toString("hex"),
        ip,
      });
    } catch (err) {
      console.error("Failed to sign report share cookie:", err);
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const cookieStore = await cookies();
    const cookieName = `report-access-${token}`;

    cookieStore.set(cookieName, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      // Track 5 Task 21: 2h (down from 24h). A recruiter review session
      // fits comfortably; anything longer can re-verify.
      maxAge: REPORT_COOKIE_TTL_SECONDS,
      path: "/",
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

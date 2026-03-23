import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

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
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
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

    // Server-side hash comparison
    const inputHash = createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
    const expectedHash = createHash("sha256")
      .update(report.recipientEmail.toLowerCase().trim())
      .digest("hex");

    if (inputHash !== expectedHash) {
      return NextResponse.json({ error: "Email does not match" }, { status: 403 });
    }

    // Set HTTP-only cookie for subsequent data fetches
    const cookieSecret = process.env.NEXTAUTH_SECRET;
    if (!cookieSecret) {
      console.error("NEXTAUTH_SECRET is not configured — cannot generate secure report access cookie");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const cookieStore = await cookies();
    const cookieName = `report-access-${token}`;
    const cookieValue = createHash("sha256")
      .update(`${token}:${inputHash}:${cookieSecret}`)
      .digest("hex");

    cookieStore.set(cookieName, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { cookies } from "next/headers";

// Rate limiting: max 5 attempts per IP per token in a 15-minute window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip: string, token: string): boolean {
  const key = `${ip}:${token}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

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

    // Rate limit check
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!checkRateLimit(ip, token)) {
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
    const cookieStore = await cookies();
    const cookieName = `report-access-${token}`;
    const cookieValue = createHash("sha256")
      .update(`${token}:${inputHash}:${process.env.NEXTAUTH_SECRET || "fallback-secret"}`)
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

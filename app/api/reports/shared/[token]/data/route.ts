import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Track-1 Task 5: rate limits for shared-report token access.
 *
 * The old behavior had NO rate limit on token lookup, making UUID
 * enumeration feasible and giving a leaked token effectively unlimited
 * attempts to extract the underlying report. We apply two layers:
 *
 * 1. Per-IP: 20 requests per 60s. Legitimate recruiter/hiring-manager
 *    reviewing a single report does not need more than a few requests.
 *    This blocks scan-and-guess attacks from any single source.
 *
 * 2. Per-token: 60 requests per 5 minutes. Even if an attacker rotates
 *    source IPs, a single token cannot be hit more than once a few
 *    seconds on average — a legitimate recruiter reading the page twice
 *    is fine, a credential-stuffing bot is not.
 *
 * Failed/blocked attempts are logged with structured fields so the
 * audit trail can answer "was this token enumerated at some point".
 */
const SHARED_TOKEN_RATE_LIMIT_PER_IP = {
  maxRequests: 20,
  windowMs: 60_000,
};

const SHARED_TOKEN_RATE_LIMIT_PER_TOKEN = {
  maxRequests: 60,
  windowMs: 5 * 60_000,
};

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * GET — Fetch shared report data.
 *
 * If the report has a recipientEmail gate, the caller must have a valid
 * `report-access-{token}` cookie set by the verify-email endpoint.
 * If no email gate exists, data is returned directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Track-1 Task 5: rate-limit BEFORE any DB lookup so token enumeration
    // attacks never touch Postgres. The per-IP key also gates guessing
    // attempts against the generic lookup endpoint (not tied to a token).
    const ipCheck = await checkRateLimit(
      `shared-report:ip:${ip}`,
      SHARED_TOKEN_RATE_LIMIT_PER_IP,
    );
    if (!ipCheck.allowed) {
      logger.warn(
        `[SharedReport] Rate-limited by IP ${ip} on token ${token.slice(0, 8)}...`,
      );
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((ipCheck.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(ipCheck.resetAt / 1000)),
          },
        },
      );
    }

    const tokenCheck = await checkRateLimit(
      `shared-report:token:${token}`,
      SHARED_TOKEN_RATE_LIMIT_PER_TOKEN,
    );
    if (!tokenCheck.allowed) {
      logger.warn(
        `[SharedReport] Rate-limited by token ${token.slice(0, 8)}... from IP ${ip}`,
      );
      // Audit: persist a failed-access attempt so admins can see the
      // enumeration pattern later. Token is stored in full for audit
      // correlation but not echoed to the client.
      prisma.reportShareView
        .create({
          data: {
            reportId: "rate-limited", // sentinel — no valid report resolved
            shareToken: token,
            viewerIp: ip,
            userAgent,
          },
        })
        .catch(() => {});
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((tokenCheck.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const report = await prisma.interviewReport.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        shareRevoked: true,
        shareExpiresAt: true,
        recipientEmail: true,
        shareScopes: true,
        overallScore: true,
        recommendation: true,
        summary: true,
        technicalSkills: true,
        softSkills: true,
        domainExpertise: true,
        clarityStructure: true,
        problemSolving: true,
        communicationScore: true,
        measurableImpact: true,
        strengths: true,
        areasToImprove: true,
        hiringAdvice: true,
        integrityScore: true,
        integrityFlags: true,
        headline: true,
        confidenceLevel: true,
        professionalExperience: true,
        roleFit: true,
        culturalFit: true,
        thinkingJudgment: true,
        riskSignals: true,
        hypothesisOutcomes: true,
        evidenceHighlights: true,
        jobMatchScore: true,
        requirementMatches: true,
        environmentFitNotes: true,
        interview: {
          select: {
            id: true,
            type: true,
            createdAt: true,
            overallScore: true,
            transcript: true,
            integrityEvents: true,
            candidate: {
              select: {
                fullName: true,
                currentTitle: true,
              },
            },
            template: {
              select: { isShadow: true },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Block sharing of shadow template reports
    if (report.interview?.template?.isShadow) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.shareRevoked) {
      return NextResponse.json({ error: "Access revoked" }, { status: 403 });
    }

    if (report.shareExpiresAt && new Date() > new Date(report.shareExpiresAt)) {
      return NextResponse.json({ error: "Link expired" }, { status: 403 });
    }

    // If email-gated, verify the access cookie
    if (report.recipientEmail) {
      if (!process.env.NEXTAUTH_SECRET) {
        console.error("NEXTAUTH_SECRET is required for email-gated shared reports");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
      }
      const cookieStore = await cookies();
      const cookieName = `report-access-${token}`;
      const cookie = cookieStore.get(cookieName);

      if (!cookie) {
        return NextResponse.json(
          { error: "Email verification required", requiresEmailVerification: true },
          { status: 403 }
        );
      }

      // Validate cookie value
      const emailHash = createHash("sha256")
        .update(report.recipientEmail.toLowerCase().trim())
        .digest("hex");
      const expectedCookieValue = createHash("sha256")
        .update(`${token}:${emailHash}:${process.env.NEXTAUTH_SECRET}`)
        .digest("hex");

      if (cookie.value !== expectedCookieValue) {
        return NextResponse.json(
          { error: "Invalid access token", requiresEmailVerification: true },
          { status: 403 }
        );
      }
    }

    // Log successful view (ip/userAgent already resolved at the top)
    prisma.reportShareView.create({
      data: { reportId: report.id, shareToken: token, viewerIp: ip, userAgent },
    }).catch(() => {});

    // Return report data (strip recipientEmail from response)
    const { recipientEmail: _, shareScopes, ...reportData } = report;

    // SECURITY: Enforce share scope restrictions — only return allowed fields
    if (shareScopes && Array.isArray(shareScopes) && shareScopes.length > 0) {
      const allowed = new Set(shareScopes as string[]);
      const filteredData: Record<string, unknown> = { id: reportData.id };
      for (const [key, value] of Object.entries(reportData)) {
        if (key === "id" || key === "interview" || allowed.has(key)) {
          filteredData[key] = value;
        }
      }
      return NextResponse.json(filteredData);
    }

    return NextResponse.json(reportData);
  } catch (error) {
    console.error("Shared report data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

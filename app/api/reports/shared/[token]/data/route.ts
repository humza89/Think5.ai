import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { verifyReportShareCookie, extractClientIp } from "@/lib/report-share-cookie";

/**
 * Rate limits for shared-report token access (salvaged from legacy PR #4).
 *
 * The proxy limiter only covers non-safe methods, so this GET had no limit:
 * share tokens could be enumerated and a leaked token hit without bound.
 *
 *  - per IP:    20 requests / 60 s  — a reviewer needs a handful per page load
 *  - per token: 60 requests / 5 min — bounds a single token even across IPs
 */
const SHARED_TOKEN_RATE_LIMIT_PER_IP = { maxRequests: 20, windowMs: 60_000 };
const SHARED_TOKEN_RATE_LIMIT_PER_TOKEN = { maxRequests: 60, windowMs: 5 * 60_000 };

function rateLimited(resetAt: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

/**
 * GET — Fetch shared report data.
 *
 * If the report has a recipientEmail gate, the caller must have a valid
 * HMAC-signed `report-access-{token}` cookie set by the verify-email endpoint
 * (see lib/report-share-cookie). If no email gate exists, data is returned
 * directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ip = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Rate-limit BEFORE any DB lookup so enumeration never reaches Postgres.
    const ipCheck = await checkRateLimit(`shared-report:ip:${ip}`, SHARED_TOKEN_RATE_LIMIT_PER_IP);
    if (!ipCheck.allowed) {
      logger.warn(`[SharedReport] Rate-limited by IP on token ${token.slice(0, 8)}…`, { ip });
      return rateLimited(ipCheck.resetAt);
    }
    const tokenCheck = await checkRateLimit(`shared-report:token:${token}`, SHARED_TOKEN_RATE_LIMIT_PER_TOKEN);
    if (!tokenCheck.allowed) {
      logger.warn(`[SharedReport] Rate-limited by token ${token.slice(0, 8)}…`, { ip, userAgent });
      return rateLimited(tokenCheck.resetAt);
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

    // If email-gated, verify the HMAC-signed access cookie
    if (report.recipientEmail) {
      const cookieStore = await cookies();
      const cookie = cookieStore.get(`report-access-${token}`);

      if (!cookie) {
        return NextResponse.json(
          { error: "Email verification required", requiresEmailVerification: true },
          { status: 403 }
        );
      }

      const emailHash = createHash("sha256")
        .update(report.recipientEmail.toLowerCase().trim())
        .digest("hex");
      const verification = verifyReportShareCookie({ token, emailHash, ip, cookieValue: cookie.value });

      if (!verification.ok) {
        if (verification.reason === "no_secret") {
          console.error("NEXTAUTH_SECRET is required for email-gated shared reports");
          return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }
        // The client opens the re-verify form on requiresEmailVerification.
        return NextResponse.json(
          {
            error:
              verification.reason === "expired"
                ? "Access expired. Please verify your email again."
                : "Invalid access token",
            requiresEmailVerification: true,
            reason: verification.reason,
          },
          { status: 403 }
        );
      }
    }

    // Log successful view
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

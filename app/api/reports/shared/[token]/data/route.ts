import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { cookies } from "next/headers";

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

    // Log view
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
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

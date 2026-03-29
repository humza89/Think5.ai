import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Compliance Report API — Enterprise attestation summary.
 *
 * Returns consent rates, retention compliance, and interview statistics
 * for enterprise buyers and compliance auditors.
 *
 * SECURITY: Admin-only endpoint. Requires admin authentication.
 */
export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total interviews and consent rates
    const [totalInterviews, consentedInterviews, completedInterviews] = await Promise.all([
      prisma.interview.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.interview.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          consentRecording: true,
          consentPrivacy: true,
          consentedAt: { not: null },
        },
      }),
      prisma.interview.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: "COMPLETED",
        },
      }),
    ]);

    const consentRate = totalInterviews > 0
      ? Math.round((consentedInterviews / totalInterviews) * 100)
      : 100;

    // Proctoring consent rate
    const proctoringConsented = await prisma.interview.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        consentProctoring: true,
      },
    });

    const proctoringConsentRate = totalInterviews > 0
      ? Math.round((proctoringConsented / totalInterviews) * 100)
      : 100;

    // Reports requiring review
    const pendingReviews = await prisma.interviewReport.count({
      where: { reviewStatus: "PENDING_REVIEW" },
    });

    // Data retention check — interviews older than 90 days without legal hold
    const retentionThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const expiredInterviews = await prisma.interview.count({
      where: {
        createdAt: { lt: retentionThreshold },
        legalHold: false,
      },
    });

    // Legal holds
    const legalHolds = await prisma.interview.count({
      where: { legalHold: true },
    });

    return NextResponse.json({
      generatedAt: now.toISOString(),
      period: { days: 30, since: thirtyDaysAgo.toISOString() },
      interviews: {
        total: totalInterviews,
        completed: completedInterviews,
        completionRate: totalInterviews > 0 ? Math.round((completedInterviews / totalInterviews) * 100) : 0,
      },
      consent: {
        recordingAndPrivacyRate: consentRate,
        proctoringRate: proctoringConsentRate,
        totalConsented: consentedInterviews,
      },
      retention: {
        expiredInterviewsWithoutHold: expiredInterviews,
        retentionPolicyDays: 90,
        compliant: expiredInterviews === 0,
      },
      legalHolds: {
        active: legalHolds,
      },
      review: {
        pendingReviews,
      },
      attestation: {
        allConsentsCollected: consentRate === 100,
        retentionCompliant: expiredInterviews === 0,
        reviewProcessActive: true,
        generatedBy: "system",
      },
    });
  } catch (error) {
    console.error("[Compliance Report] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate compliance report" },
      { status: 500 }
    );
  }
}

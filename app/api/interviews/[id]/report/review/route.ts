import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// POST - Submit a review decision for an interview report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await requireInterviewAccess(id);

    const body = await request.json();
    const { decision, overrideReason, newRecommendation } = body;

    if (!decision || !["APPROVE", "REJECT", "FLAG", "OVERRIDE"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision. Must be APPROVE, REJECT, FLAG, or OVERRIDE." },
        { status: 400 }
      );
    }

    if (decision === "OVERRIDE" && !overrideReason) {
      return NextResponse.json(
        { error: "Override reason is required when overriding." },
        { status: 400 }
      );
    }

    if (decision === "OVERRIDE" && !newRecommendation) {
      return NextResponse.json(
        { error: "New recommendation is required when overriding." },
        { status: 400 }
      );
    }

    // Get current report
    const report = await prisma.interviewReport.findUnique({
      where: { interviewId: id },
      select: { id: true, recommendation: true, reviewStatus: true },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const isOverride = decision === "OVERRIDE";
    const newReviewStatus = isOverride ? "OVERRIDDEN" : "REVIEWED";

    // Create review decision record
    const reviewDecision = await prisma.reviewDecision.create({
      data: {
        interviewId: id,
        reviewerId: user.id,
        reviewerEmail: profile.email,
        decision,
        overrideReason: overrideReason || null,
        previousRecommendation: report.recommendation,
        newRecommendation: isOverride ? newRecommendation : report.recommendation,
      },
    });

    // Update report review status
    const updateData: Record<string, unknown> = {
      reviewStatus: newReviewStatus,
      reviewedAt: new Date(),
      reviewedBy: user.id,
    };

    // If overriding, update the recommendation
    if (isOverride && newRecommendation) {
      updateData.recommendation = newRecommendation;
    }

    await prisma.interviewReport.update({
      where: { id: report.id },
      data: updateData,
    });

    // Audit log
    logInterviewActivity({
      interviewId: id,
      action: "report.reviewed",
      userId: user.id,
      userRole: profile.role,
      metadata: { decision, overrideReason, newRecommendation, previousRecommendation: report.recommendation },
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    return NextResponse.json({
      reviewDecision,
      reviewStatus: newReviewStatus,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error submitting review decision:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// GET - List review decisions for an interview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireInterviewAccess(id);

    const decisions = await prisma.reviewDecision.findMany({
      where: { interviewId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ decisions });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInterviewAccessScope, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// POST - Submit a review decision for an interview report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 sweep: tenant-scoped access. The scope helper already
    // rejects anyone who isn't recruiter / hiring_manager / admin with
    // a 404, so the role check that used to live above is now folded
    // into the scope. We still need profile.email + user.id for the
    // review-decision record below — resolve them via the scope.
    const scope = await buildInterviewAccessScope(id);

    // Existence check: if the caller can't see this interview, 404 early
    // before touching the body or validation logic.
    const interviewExists = await prisma.interview.findFirst({
      where: scope.whereFragment,
      select: { id: true },
    });
    if (!interviewExists) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Review decisions include the reviewer's email on the record for
    // audit, so we still need the profile — but we only fetch it AFTER
    // the scoped check so forbidden callers don't cause extra Supabase
    // round-trips.
    const { user, profile } = await getAuthenticatedUser();

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 sweep: tenant-scoped access. If the caller can't see the
    // interview, they cannot enumerate its review decisions.
    const scope = await buildInterviewAccessScope(id);
    const interview = await prisma.interview.findFirst({
      where: scope.whereFragment,
      select: { id: true },
    });
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

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

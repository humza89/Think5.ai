import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import {
  sendApprovalEmail,
  sendRejectionEmail,
  sendHoldEmail,
} from "@/lib/email/resend";
import type { OnboardingStatus } from "@prisma/client";

const ACTION_TO_STATUS: Record<string, OnboardingStatus> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  on_hold: "ON_HOLD",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"]);
    const { id } = await params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        candidateSkills: { orderBy: { createdAt: "desc" } },
        candidateExperiences: { orderBy: { startDate: "desc" } },
        candidateEducation: { orderBy: { startDate: "desc" } },
        certifications: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        jobPreferences: true,
        approvalActions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...candidate,
      skills: candidate.candidateSkills,
      experiences: candidate.candidateExperiences,
      education: candidate.candidateEducation,
      approvalHistory: candidate.approvalActions,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireRole(["admin"]);
    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body;

    // Validate action
    if (!action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json(
        { error: "Invalid action. Must be: approved, rejected, or on_hold" },
        { status: 400 }
      );
    }

    // Require reason for rejection
    if (action === "rejected" && (!reason || !reason.trim())) {
      return NextResponse.json(
        { error: "Reason is required when rejecting a candidate" },
        { status: 400 }
      );
    }

    // Fetch candidate
    const candidate = await prisma.candidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (!candidate.onboardingCompleted) {
      return NextResponse.json(
        { error: "Cannot action a candidate who hasn't completed onboarding" },
        { status: 400 }
      );
    }

    const previousStatus = candidate.onboardingStatus;
    const newStatus = ACTION_TO_STATUS[action];

    // Transaction: update candidate + create approval action
    const [updatedCandidate] = await prisma.$transaction([
      prisma.candidate.update({
        where: { id },
        data: {
          onboardingStatus: newStatus,
          approvedAt: action === "approved" ? new Date() : candidate.approvedAt,
          approvedBy: action === "approved" ? user.id : candidate.approvedBy,
          rejectionReason: action === "rejected" ? reason.trim() : null,
        },
      }),
      prisma.approvalAction.create({
        data: {
          candidateId: id,
          action,
          reason: reason?.trim() || null,
          adminUserId: user.id,
          adminEmail: profile.email,
        },
      }),
    ]);

    // Log activity
    logActivity({
      userId: user.id,
      userRole: "admin",
      action: `candidate.${action}`,
      entityType: "Candidate",
      entityId: id,
      metadata: {
        reason: reason?.trim() || null,
        previousStatus,
        newStatus,
        adminEmail: profile.email,
      },
    }).catch(console.error);

    // Send email asynchronously
    if (candidate.email) {
      const firstName = candidate.fullName?.split(" ")[0] || "there";
      if (action === "approved") {
        sendApprovalEmail(candidate.email, firstName).catch(console.error);
      } else if (action === "rejected") {
        sendRejectionEmail(candidate.email, firstName, reason.trim()).catch(console.error);
      } else if (action === "on_hold") {
        sendHoldEmail(candidate.email, firstName, reason?.trim()).catch(console.error);
      }
    }

    return NextResponse.json({
      success: true,
      candidate: updatedCandidate,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

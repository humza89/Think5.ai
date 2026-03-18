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

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["admin"]);
    const body = await request.json();
    const { candidateIds, action, reason } = body;

    // Validate
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return NextResponse.json(
        { error: "candidateIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (candidateIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 candidates per bulk action" },
        { status: 400 }
      );
    }

    if (!action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json(
        { error: "Invalid action. Must be: approved, rejected, or on_hold" },
        { status: 400 }
      );
    }

    if (action === "rejected" && (!reason || !reason.trim())) {
      return NextResponse.json(
        { error: "Reason is required when rejecting candidates" },
        { status: 400 }
      );
    }

    const newStatus = ACTION_TO_STATUS[action];

    // Fetch eligible candidates
    const candidates = await prisma.candidate.findMany({
      where: {
        id: { in: candidateIds },
        onboardingCompleted: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        onboardingStatus: true,
      },
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No eligible candidates found" },
        { status: 404 }
      );
    }

    // Build transaction operations
    const operations = candidates.flatMap((candidate: typeof candidates[number]) => [
      prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          onboardingStatus: newStatus,
          approvedAt: action === "approved" ? new Date() : undefined,
          approvedBy: action === "approved" ? user.id : undefined,
          rejectionReason: action === "rejected" ? reason.trim() : null,
        },
      }),
      prisma.approvalAction.create({
        data: {
          candidateId: candidate.id,
          action,
          reason: reason?.trim() || null,
          adminUserId: user.id,
          adminEmail: profile.email,
        },
      }),
    ]);

    await prisma.$transaction(operations);

    // Log activity + send emails asynchronously
    for (const candidate of candidates) {
      logActivity({
        userId: user.id,
        userRole: "admin",
        action: `candidate.${action}`,
        entityType: "Candidate",
        entityId: candidate.id,
        metadata: {
          reason: reason?.trim() || null,
          previousStatus: candidate.onboardingStatus,
          newStatus,
          adminEmail: profile.email,
          bulk: true,
        },
      }).catch(console.error);

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
    }

    const skipped = candidateIds.length - candidates.length;

    return NextResponse.json({
      success: true,
      updated: candidates.length,
      skipped,
      errors: skipped > 0
        ? [`${skipped} candidate(s) were skipped (not found or onboarding incomplete)`]
        : [],
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

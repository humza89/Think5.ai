import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-log";
import {
  sendApprovalEmail,
  sendRejectionEmail,
  sendHoldEmail,
} from "@/lib/email/resend";
import type { OnboardingStatus, RecruiterOnboardingStatus } from "@prisma/client";
import type { OnboardingStatusValue } from "@/types/supabase";

const ACTION_TO_CANDIDATE_STATUS: Record<string, OnboardingStatus> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  on_hold: "ON_HOLD",
};

const ACTION_TO_RECRUITER_STATUS: Record<string, RecruiterOnboardingStatus> = {
  approved: "APPROVED",
  rejected: "REJECTED",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"]);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "candidate";

    if (type === "recruiter") {
      const recruiter = await prisma.recruiter.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!recruiter) {
        return NextResponse.json({ error: "Recruiter not found" }, { status: 404 });
      }

      return NextResponse.json({
        ...recruiter,
        companyDetails: recruiter.company,
        hiringPreferences: recruiter.hiringPreferences,
        onboardingCompleted: recruiter.onboardingCompleted,
        onboardingStatus: recruiter.onboardingStatus,
      });
    }

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
    const { action, reason, type = "candidate" } = body;

    // Route to recruiter approval handler
    if (type === "recruiter") {
      return handleRecruiterApproval(id, action, reason, user, profile);
    }

    // Validate action
    if (!action || !ACTION_TO_CANDIDATE_STATUS[action]) {
      return NextResponse.json(
        { error: "Invalid action. Must be: approved, rejected, or on_hold" },
        { status: 400 }
      );
    }

    // Require reason for rejection
    if (action === "rejected" && (!reason || !reason.trim())) {
      return NextResponse.json(
        { error: "Reason is required when rejecting" },
        { status: 400 }
      );
    }

    // Fetch candidate with recruiter's company for tenant scoping
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: { recruiter: { select: { companyId: true } } },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // SECURITY: Verify admin has access to this candidate's tenant
    const adminRecruiter = await prisma.recruiter.findFirst({
      where: { supabaseUserId: user.id },
      select: { companyId: true },
    });
    if (adminRecruiter?.companyId && candidate.recruiter?.companyId
        && adminRecruiter.companyId !== candidate.recruiter.companyId) {
      return NextResponse.json({ error: "Forbidden: candidate not in your company" }, { status: 403 });
    }

    if (!candidate.onboardingCompleted) {
      return NextResponse.json(
        { error: "Cannot action a candidate who hasn't completed onboarding" },
        { status: 400 }
      );
    }

    const previousStatus = candidate.onboardingStatus;
    const newStatus = ACTION_TO_CANDIDATE_STATUS[action];

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

    // Sync onboarding_status to Supabase profiles for proxy-level gating
    if (candidate.email) {
      const supabaseAdmin = await createSupabaseAdminClient();
      const statusMap: Record<string, OnboardingStatusValue> = {
        APPROVED: "approved",
        REJECTED: "rejected",
        ON_HOLD: "on_hold",
      };
      const mappedStatus = statusMap[newStatus] ?? (newStatus.toLowerCase() as OnboardingStatusValue);
      await supabaseAdmin
        .from("profiles")
        .update({ onboarding_status: mappedStatus })
        .eq("email", candidate.email);
    }

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

async function handleRecruiterApproval(
  id: string,
  action: string,
  reason: string | undefined,
  user: { id: string },
  adminProfile: { email: string }
) {
  if (!action || !ACTION_TO_RECRUITER_STATUS[action]) {
    return NextResponse.json(
      { error: "Invalid action. Must be: approved or rejected" },
      { status: 400 }
    );
  }

  if (action === "rejected" && (!reason || !reason.trim())) {
    return NextResponse.json(
      { error: "Reason is required when rejecting" },
      { status: 400 }
    );
  }

  const recruiter = await prisma.recruiter.findUnique({ where: { id } });
  if (!recruiter) {
    return NextResponse.json({ error: "Recruiter not found" }, { status: 404 });
  }

  if (!recruiter.onboardingCompleted) {
    return NextResponse.json(
      { error: "Cannot action a recruiter who hasn't completed onboarding" },
      { status: 400 }
    );
  }

  const newStatus = ACTION_TO_RECRUITER_STATUS[action];

  const updatedRecruiter = await prisma.recruiter.update({
    where: { id },
    data: { onboardingStatus: newStatus },
  });

  // Sync onboarding_status to Supabase profiles
  if (recruiter.supabaseUserId) {
    const supabaseAdmin = await createSupabaseAdminClient();
    await supabaseAdmin
      .from("profiles")
      .update({ onboarding_status: action === "approved" ? "approved" : "rejected" })
      .eq("id", recruiter.supabaseUserId);
  }

  logActivity({
    userId: user.id,
    userRole: "admin",
    action: `recruiter.${action}`,
    entityType: "Recruiter",
    entityId: id,
    metadata: {
      reason: reason?.trim() || null,
      newStatus,
      adminEmail: adminProfile.email,
    },
  }).catch(console.error);

  // Send email
  if (recruiter.email) {
    const firstName = recruiter.name?.split(" ")[0] || "there";
    if (action === "approved") {
      sendApprovalEmail(recruiter.email, firstName).catch(console.error);
    } else if (action === "rejected") {
      sendRejectionEmail(recruiter.email, firstName, reason!.trim()).catch(console.error);
    }
  }

  return NextResponse.json({
    success: true,
    recruiter: updatedRecruiter,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildInterviewAccessScope,
  handleAuthError,
} from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { isValidTransition, getAllowedTransitions } from "@/lib/interview-state-machine";
import { inngest } from "@/inngest/client";
import { cascadeInterviewStatus, transitionInvitation } from "@/lib/invitation-lifecycle";

// GET - Get interview details with report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 Task 4: single tenant-scoped query. The whereFragment comes
    // from buildInterviewAccessScope() and enforces tenant isolation at the
    // DB layer, so a bug in the auth-check logic cannot leak cross-tenant
    // data. If the row doesn't match the scope we return 404 — same shape
    // as "interview doesn't exist at all" — to avoid ID-enumeration timing
    // side-channel.
    const scope = await buildInterviewAccessScope(id);

    const interview = await prisma.interview.findFirst({
      where: scope.whereFragment,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            currentTitle: true,
            currentCompany: true,
            profileImage: true,
            skills: true,
            experienceYears: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        report: true,
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    // Audit trail: log interview detail access. Intentionally AFTER the
    // scoped query so we only log successful, authorized accesses — an
    // attacker hitting a forbidden id produces no audit-log noise.
    logInterviewActivity({
      interviewId: id,
      action: "interview.detail_viewed",
      userId: scope.userId,
      userRole: scope.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    return NextResponse.json(interview);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH - Update interview status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 Task 4: scoped access + scoped data read. The status-check
    // query and the eventual update are BOTH tenant-scoped via the same
    // whereFragment so a cross-tenant id cannot be updated.
    const scope = await buildInterviewAccessScope(id);

    const body = await request.json();
    const { status: newStatus, transcript, duration, overallScore } = body;

    const updateData: any = {};

    if (newStatus) {
      // Validate status transition using state machine. Tenant-scoped read.
      const currentInterview = await prisma.interview.findFirst({
        where: scope.whereFragment,
        select: { status: true },
      });
      if (!currentInterview) {
        return NextResponse.json({ error: "Interview not found" }, { status: 404 });
      }
      if (!isValidTransition(currentInterview.status, newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${currentInterview.status} to ${newStatus}. Allowed transitions: ${getAllowedTransitions(currentInterview.status).join(", ") || "none (terminal state)"}`,
          },
          { status: 400 }
        );
      }

      updateData.status = newStatus;

      if (newStatus === "IN_PROGRESS") {
        updateData.startedAt = new Date();
      }

      if (newStatus === "COMPLETED") {
        updateData.completedAt = new Date();

        // Update candidate's ariaInterviewed flag — tenant-scoped read so
        // an attacker can't reach into a cross-tenant candidate record
        // through a forged interview id.
        const interview = await prisma.interview.findFirst({
          where: scope.whereFragment,
          select: { candidateId: true },
        });

        if (interview) {
          await prisma.candidate.update({
            where: { id: interview.candidateId },
            data: {
              ariaInterviewed: true,
              ...(overallScore !== undefined ? { ariaOverallScore: overallScore } : {}),
            },
          });
        }
      }
    }

    if (transcript !== undefined) updateData.transcript = transcript;
    if (duration !== undefined) updateData.duration = duration;
    if (overallScore !== undefined) updateData.overallScore = overallScore;

    // Track-1 Task 4: scoped update via updateMany + tenant whereFragment.
    // Prisma's update() requires a unique where, but updateMany() with the
    // composite whereFragment enforces tenant at the DB layer. We then
    // re-read with a scoped findFirst to return the updated row.
    const updateResult = await prisma.interview.updateMany({
      where: scope.whereFragment,
      data: updateData,
    });
    if (updateResult.count === 0) {
      // Either the row doesn't exist OR the tenant filter rejected it.
      // Same error shape as 404 to avoid information disclosure.
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }
    const updated = await prisma.interview.findFirst({
      where: scope.whereFragment,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
          },
        },
        report: {
          select: {
            id: true,
            recommendation: true,
          },
        },
      },
    });

    // Cascade interview status to invitation lifecycle
    if (newStatus === "CANCELLED") {
      // Recruiter-initiated cancel → REVOKED (not ABANDONED)
      const interviewForInvite = await prisma.interview.findFirst({
        where: scope.whereFragment,
        select: { invitationId: true },
      });
      if (interviewForInvite?.invitationId) {
        transitionInvitation(interviewForInvite.invitationId, "REVOKED", { revokedBy: scope.userId }).catch(console.error);
      }
    } else if (newStatus) {
      cascadeInterviewStatus(id, newStatus).catch(console.error);
    }

    // Dispatch Inngest job when interview completes
    if (newStatus === "COMPLETED") {
      inngest
        .send({ name: "interview/completed", data: { interviewId: id } })
        .catch((err: unknown) => {
          // Fall back to in-process if Inngest unavailable
          console.error("Inngest dispatch failed, falling back:", err);
          import("@/lib/report-generator").then(({ generateReportInBackground }) =>
            generateReportInBackground(id).catch(console.error)
          );
        });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

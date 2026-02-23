import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getRecruiterForUser } from "@/lib/auth";

const VALID_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEWING",
  "SHORTLISTED",
  "OFFERED",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
] as const;

type ValidStatus = (typeof VALID_STATUSES)[number];

/**
 * PATCH /api/jobs/[id]/applications/[appId]
 * Update an application's status (used by the pipeline Kanban board).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);
    const { id: jobId, appId } = await params;

    const body = await request.json();
    const { status } = body;

    // Validate status
    if (!status || !VALID_STATUSES.includes(status as ValidStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Verify the application exists and belongs to this job
    const application = await prisma.application.findFirst({
      where: {
        id: appId,
        jobId,
      },
      include: {
        job: { select: { recruiterId: true } },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Non-admin recruiters can only update applications for their own jobs
    if (profile.role !== "admin") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );

      if (application.job.recruiterId !== recruiter.id) {
        return NextResponse.json(
          { error: "Forbidden: you do not own this job" },
          { status: 403 }
        );
      }
    }

    // Update the application status
    const updated = await prisma.application.update({
      where: { id: appId },
      data: {
        status: status as ValidStatus,
        reviewedAt: new Date(),
        reviewedBy: user.id,
      },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            currentCompany: true,
            profileImage: true,
            ariaOverallScore: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating application:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * GET /api/jobs/[id]/applications/[appId]
 * Get a single application by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
    const { id: jobId, appId } = await params;

    const application = await prisma.application.findFirst({
      where: {
        id: appId,
        jobId,
      },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            currentCompany: true,
            profileImage: true,
            ariaOverallScore: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(application);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching application:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

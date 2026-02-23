import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: true,
        recruiter: { select: { id: true, name: true, email: true } },
        jobSkills: true,
        _count: {
          select: {
            applications: true,
            matches: true,
            interviews: true,
            invitations: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching job:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const {
      title,
      description,
      location,
      department,
      industry,
      employmentType,
      remoteType,
      salaryMin,
      salaryMax,
      salaryCurrency,
      experienceMin,
      experienceMax,
      urgencyLevel,
      companyId,
      skills,
      closesAt,
    } = body;

    // Update skills: delete existing and recreate
    if (skills) {
      await prisma.jobSkill.deleteMany({ where: { jobId: id } });
    }

    const job = await prisma.job.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(location !== undefined && { location }),
        ...(department !== undefined && { department }),
        ...(industry !== undefined && { industry }),
        ...(employmentType && { employmentType }),
        ...(remoteType && { remoteType }),
        ...(salaryMin !== undefined && { salaryMin: salaryMin ? parseFloat(salaryMin) : null }),
        ...(salaryMax !== undefined && { salaryMax: salaryMax ? parseFloat(salaryMax) : null }),
        ...(salaryCurrency && { salaryCurrency }),
        ...(experienceMin !== undefined && { experienceMin: experienceMin ? parseInt(experienceMin) : null }),
        ...(experienceMax !== undefined && { experienceMax: experienceMax ? parseInt(experienceMax) : null }),
        ...(urgencyLevel !== undefined && { urgencyLevel: parseInt(urgencyLevel) }),
        ...(companyId && { companyId }),
        ...(closesAt !== undefined && { closesAt: closesAt ? new Date(closesAt) : null }),
        ...(skills?.length && {
          jobSkills: {
            create: skills.map((s: any) => ({
              skillName: s.skillName,
              skillCategory: s.skillCategory || null,
              importance: s.importance || "REQUIRED",
              minYears: s.minYears ? parseInt(s.minYears) : null,
            })),
          },
        }),
      },
      include: {
        company: { select: { id: true, name: true, logoUrl: true } },
        recruiter: { select: { id: true, name: true } },
        jobSkills: true,
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating job:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;
    const body = await request.json();
    const { status: newStatus } = body;

    const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "FILLED"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Status transition validation
    const validTransitions: Record<string, string[]> = {
      DRAFT: ["ACTIVE"],
      ACTIVE: ["PAUSED", "CLOSED", "FILLED"],
      PAUSED: ["ACTIVE", "CLOSED"],
      CLOSED: ["ACTIVE"],
      FILLED: [],
    };

    if (!validTransitions[existingJob.status]?.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${existingJob.status} to ${newStatus}` },
        { status: 400 }
      );
    }

    const job = await prisma.job.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === "ACTIVE" && !existingJob.status ? { postedAt: new Date() } : {}),
      },
      include: {
        company: { select: { id: true, name: true, logoUrl: true } },
        recruiter: { select: { id: true, name: true } },
        jobSkills: true,
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating job status:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;

    await prisma.job.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error deleting job:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

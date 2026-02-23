import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getAuthenticatedUser();
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id, status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        department: true,
        industry: true,
        employmentType: true,
        remoteType: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        experienceMin: true,
        experienceMax: true,
        postedAt: true,
        closesAt: true,
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            industry: true,
            description: true,
            website: true,
            companySize: true,
            headquarters: true,
          },
        },
        jobSkills: {
          select: { skillName: true, skillCategory: true, importance: true, minYears: true },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// Apply to a job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthenticatedUser();
    const { id: jobId } = await params;
    const body = await request.json().catch(() => ({}));

    // Find the candidate linked to this user
    const candidate = await prisma.candidate.findFirst({
      where: {
        OR: [
          { email: user.email },
          { recruiter: { supabaseUserId: user.id } },
        ],
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found. Please complete your profile first." },
        { status: 400 }
      );
    }

    // Check job exists and is active
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });

    if (!job || job.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Job not found or no longer accepting applications" },
        { status: 404 }
      );
    }

    // Check if already applied
    const existing = await prisma.application.findUnique({
      where: { candidateId_jobId: { candidateId: candidate.id, jobId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You have already applied to this job" },
        { status: 409 }
      );
    }

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId,
        status: "APPLIED",
        source: "organic",
        coverLetterUrl: body.coverLetterUrl || null,
        notes: body.notes || null,
      },
      include: {
        job: {
          select: { id: true, title: true, company: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error applying to job:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  getRecruiterForUser,
  requireCandidateAccess,
  handleAuthError,
} from "@/lib/auth";

// POST - Schedule an interview for a candidate
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { candidateId, type = "TECHNICAL" } = body;

    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId is required" },
        { status: 400 }
      );
    }

    // Verify ownership of the candidate
    await requireCandidateAccess(candidateId);

    // Get recruiter record
    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Create interview
    const interview = await prisma.interview.create({
      data: {
        candidateId,
        scheduledBy: recruiter.id,
        type,
        status: "PENDING",
      },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            currentTitle: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error scheduling interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// GET - List interviews (filtered by session recruiter)
export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    const where: any = {};

    // Recruiters: only see interviews they scheduled
    if (profile.role === "recruiter") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
      where.scheduledBy = recruiter.id;
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            currentTitle: true,
            profileImage: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        report: {
          select: {
            id: true,
            recommendation: true,
            summary: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(interviews);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

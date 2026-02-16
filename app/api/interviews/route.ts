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
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

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

    // E2: Search by candidate name
    if (search) {
      where.candidate = {
        fullName: { contains: search, mode: "insensitive" },
      };
    }

    // E4: Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // E3: Sort options
    const validSortFields = ["createdAt", "overallScore", "status"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    // E1: Pagination
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 100); // Cap at 100

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
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
              overallScore: true,
              recommendation: true,
              summary: true,
            },
          },
        },
        orderBy: { [orderByField]: order } as any,
        skip,
        take,
      }),
      prisma.interview.count({ where }),
    ]);

    return NextResponse.json({
      interviews,
      total,
      page,
      pageSize: take,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

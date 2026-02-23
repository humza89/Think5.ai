import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getRecruiterForUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireRole(["recruiter", "admin"]);

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search");
    const employmentType = searchParams.get("employmentType");
    const remoteType = searchParams.get("remoteType");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = {};

    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    if (employmentType) where.employmentType = employmentType;
    if (remoteType) where.remoteType = remoteType;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { department: { contains: search, mode: "insensitive" } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, logoUrl: true } },
          recruiter: { select: { id: true, name: true } },
          _count: {
            select: {
              applications: true,
              matches: true,
              interviews: true,
            },
          },
          jobSkills: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching jobs:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const body = await request.json();
    const {
      title,
      description,
      location,
      department,
      industry,
      status: jobStatus,
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

    if (!title || !description || !companyId) {
      return NextResponse.json(
        { error: "Title, description, and company are required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,
        department,
        industry,
        status: jobStatus || "DRAFT",
        employmentType: employmentType || "FULL_TIME",
        remoteType: remoteType || "ONSITE",
        salaryMin: salaryMin ? parseFloat(salaryMin) : null,
        salaryMax: salaryMax ? parseFloat(salaryMax) : null,
        salaryCurrency: salaryCurrency || "USD",
        experienceMin: experienceMin ? parseInt(experienceMin) : null,
        experienceMax: experienceMax ? parseInt(experienceMax) : null,
        urgencyLevel: urgencyLevel ? parseInt(urgencyLevel) : 3,
        closesAt: closesAt ? new Date(closesAt) : null,
        postedAt: jobStatus === "ACTIVE" ? new Date() : null,
        recruiterId: recruiter.id,
        companyId,
        jobSkills: skills?.length
          ? {
              create: skills.map((s: any) => ({
                skillName: s.skillName,
                skillCategory: s.skillCategory || null,
                importance: s.importance || "REQUIRED",
                minYears: s.minYears ? parseInt(s.minYears) : null,
              })),
            }
          : undefined,
      },
      include: {
        company: { select: { id: true, name: true, logoUrl: true } },
        recruiter: { select: { id: true, name: true } },
        jobSkills: true,
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating job:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

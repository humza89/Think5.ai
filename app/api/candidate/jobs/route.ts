import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await getAuthenticatedUser();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const location = searchParams.get("location");
    const employmentType = searchParams.get("employmentType");
    const remoteType = searchParams.get("remoteType");
    const industry = searchParams.get("industry");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = {
      status: "ACTIVE",
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { company: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (location) {
      where.location = { contains: location, mode: "insensitive" };
    }
    if (employmentType) where.employmentType = employmentType;
    if (remoteType) where.remoteType = remoteType;
    if (industry) {
      where.industry = { contains: industry, mode: "insensitive" };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
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
          company: {
            select: { id: true, name: true, logoUrl: true, industry: true },
          },
          jobSkills: {
            select: { skillName: true, importance: true },
          },
        },
        orderBy: { postedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

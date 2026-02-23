import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

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
      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    const applicationWhere = { candidateId: candidate.id };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where: applicationWhere,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              employmentType: true,
              remoteType: true,
              company: {
                select: { id: true, name: true, logoUrl: true },
              },
            },
          },
        },
        orderBy: { appliedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.application.count({ where: applicationWhere }),
    ]);

    return NextResponse.json({
      data: applications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

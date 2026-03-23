import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError, getRecruiterForUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await requireApprovedAccess(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { recruiterId: recruiter.id };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [invitations, total, lifecycleStats] = await Promise.all([
      prisma.interviewInvitation.findMany({
        where,
        include: {
          candidate: { select: { id: true, fullName: true, email: true } },
          job: { select: { id: true, title: true, company: { select: { name: true } } } },
          template: { select: { id: true, name: true } },
          interview: { select: { id: true, status: true, overallScore: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.interviewInvitation.count({ where }),
      // Lifecycle stats — counts per status for this recruiter (within date range)
      prisma.interviewInvitation.groupBy({
        by: ["status"],
        where: { recruiterId: recruiter.id, ...(from || to ? { createdAt: where.createdAt } : {}) } as Record<string, unknown>,
        _count: true,
      }),
    ]);

    // Compute conversion metrics
    type StatusRow = { status: string; _count: number };
    const statusCounts = lifecycleStats.reduce((acc: Record<string, number>, row: StatusRow) => {
      acc[row.status] = row._count;
      return acc;
    }, {} as Record<string, number>);

    const totalSent = (Object.values(statusCounts) as number[]).reduce((a, b) => a + b, 0);
    const totalAccepted = (statusCounts["ACCEPTED"] || 0) + (statusCounts["COMPLETED"] || 0);
    const conversionRate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0;

    return NextResponse.json({
      data: invitations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      lifecycle: {
        statusCounts,
        totalSent,
        totalAccepted,
        conversionRate,
        expired: statusCounts["EXPIRED"] || 0,
        declined: statusCounts["DECLINED"] || 0,
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

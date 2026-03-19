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
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "20"))
    );
    const skip = (page - 1) * limit;
    const status = url.searchParams.get("status");

    const where: Record<string, unknown> = { recruiterId: recruiter.id };
    if (status) where.status = status;

    const [invitations, total, stats] = await Promise.all([
      prisma.interviewInvitation.findMany({
        where,
        include: {
          candidate: { select: { fullName: true, email: true } },
          job: {
            select: { title: true, company: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.interviewInvitation.count({ where }),
      // Stats counts
      Promise.all([
        prisma.interviewInvitation.count({
          where: { recruiterId: recruiter.id },
        }),
        prisma.interviewInvitation.count({
          where: { recruiterId: recruiter.id, status: { in: ["PENDING", "SENT"] } },
        }),
        prisma.interviewInvitation.count({
          where: { recruiterId: recruiter.id, status: "ACCEPTED" },
        }),
        prisma.interviewInvitation.count({
          where: { recruiterId: recruiter.id, status: "EXPIRED" },
        }),
      ]),
    ]);

    return NextResponse.json({
      data: invitations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: stats[0],
        pending: stats[1],
        accepted: stats[2],
        expired: stats[3],
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

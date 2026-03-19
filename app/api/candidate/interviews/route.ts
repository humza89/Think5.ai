import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { profile } = await requireApprovedAccess(["candidate"]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      invitedEmail: { equals: profile.email, mode: "insensitive" },
    };

    if (status && status !== "all") {
      where.status = status;
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        include: {
          candidate: {
            select: {
              fullName: true,
              currentTitle: true,
              profileImage: true,
            },
          },
          report: {
            select: {
              overallScore: true,
              recommendation: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.interview.count({ where }),
    ]);

    return NextResponse.json({ interviews, total });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

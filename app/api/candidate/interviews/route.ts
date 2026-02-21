import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { profile } = await getAuthenticatedUser();

    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

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

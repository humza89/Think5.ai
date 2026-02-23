import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();

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
      return NextResponse.json({ applications: [] });
    }

    const applications = await prisma.application.findMany({
      where: { candidateId: candidate.id },
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
    });

    return NextResponse.json({ applications });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

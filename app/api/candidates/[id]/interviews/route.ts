import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateAccess, handleAuthError } from "@/lib/auth";

// GET - List all interviews for a candidate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    await requireCandidateAccess(id);

    const interviews = await prisma.interview.findMany({
      where: { candidateId: id },
      include: {
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
            domainExpertise: true,
            problemSolving: true,
            communicationScore: true,
            strengths: true,
            areasToImprove: true,
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
    console.error("Error fetching candidate interviews:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

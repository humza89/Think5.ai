import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateAccess, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check (recruiters: own candidates only, admins: all)
    await requireCandidateAccess(id);

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        notes: {
          orderBy: {
            createdAt: "desc",
          },
        },
        matches: {
          include: {
            role: {
              include: {
                client: true,
              },
            },
          },
          orderBy: {
            fitScore: "desc",
          },
        },
        interviews: {
          include: {
            report: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(candidate);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching candidate:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    await requireCandidateAccess(id);

    const body = await request.json();

    // Prevent overriding recruiterId via body
    delete body.recruiterId;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(candidate);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error updating candidate:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    await requireCandidateAccess(id);

    await prisma.candidate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error deleting candidate:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

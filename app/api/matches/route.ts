import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateMatchesForRole,
  generateMatchesForCandidate,
} from "@/lib/matching-engine";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const candidateId = searchParams.get("candidateId");
    const roleId = searchParams.get("roleId");
    const minScore = searchParams.get("minScore");

    const where: any = {};

    if (candidateId) {
      where.candidateId = candidateId;
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (minScore) {
      where.fitScore = {
        gte: parseFloat(minScore),
      };
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        candidate: {
          include: {
            recruiter: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        role: {
          include: {
            client: true,
          },
        },
      },
      orderBy: {
        fitScore: "desc",
      },
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { candidateId, roleId, regenerateAll } = body;

    if (regenerateAll) {
      // Regenerate all matches (expensive operation)
      const roles = await prisma.role.findMany();

      for (const role of roles) {
        await generateMatchesForRole(role.id);
      }

      return NextResponse.json({ message: "All matches regenerated" });
    }

    if (candidateId) {
      const matches = await generateMatchesForCandidate(candidateId);
      return NextResponse.json(matches);
    }

    if (roleId) {
      const matches = await generateMatchesForRole(roleId);
      return NextResponse.json(matches);
    }

    return NextResponse.json(
      { error: "Please provide candidateId, roleId, or regenerateAll" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error generating matches:", error);
    return NextResponse.json(
      { error: "Failed to generate matches" },
      { status: 500 }
    );
  }
}

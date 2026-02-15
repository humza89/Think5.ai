import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRoleEmbedding, generateMatchesForRole } from "@/lib/matching-engine";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId");

    const where: any = {};

    if (clientId) {
      where.clientId = clientId;
    }

    const roles = await prisma.role.findMany({
      where,
      include: {
        client: true,
        matches: {
          include: {
            candidate: true,
          },
          orderBy: {
            fitScore: "desc",
          },
          take: 10,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      clientId,
      title,
      location,
      salaryRange,
      skillsRequired,
      description,
      experienceYears,
    } = body;

    if (!clientId || !title || !description) {
      return NextResponse.json(
        { error: "Client ID, title, and description are required" },
        { status: 400 }
      );
    }

    const role = await prisma.role.create({
      data: {
        clientId,
        title,
        location,
        salaryRange,
        skillsRequired: skillsRequired || [],
        description,
        experienceYears,
      },
      include: {
        client: true,
      },
    });

    // Generate embedding and matches asynchronously
    if (process.env.OPENAI_API_KEY) {
      generateRoleEmbedding(role.id)
        .then(() => generateMatchesForRole(role.id))
        .catch((error) => {
          console.error("Error generating role embedding and matches:", error);
        });
    }

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error("Error creating role:", error);
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 }
    );
  }
}

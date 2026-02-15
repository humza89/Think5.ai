import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET() {
  try {
    // Require recruiter or admin role
    await requireRole(["recruiter", "admin"]);

    const clients = await prisma.client.findMany({
      include: {
        roles: {
          include: {
            matches: {
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(clients);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching clients:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require recruiter or admin role
    await requireRole(["recruiter", "admin"]);

    const body = await request.json();

    const {
      name,
      industry,
      funding,
      companySize,
      logoUrl,
      website,
      description,
      linkedinUrl,
      linkedinId,
      companyLogoCdnUrl,
      employeeCount,
      foundedYear,
      headquarters,
      specialties,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name,
        industry,
        funding,
        companySize,
        logoUrl,
        website,
        description,
        linkedinUrl,
        linkedinId,
        companyLogoCdnUrl,
        employeeCount,
        foundedYear,
        headquarters,
        specialties,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating client:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

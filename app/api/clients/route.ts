import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
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
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}

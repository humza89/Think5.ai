import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require recruiter or admin role
    await requireRole(["recruiter", "admin"]);

    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        roles: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(client);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching client:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

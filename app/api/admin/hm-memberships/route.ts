import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getAuthenticatedUser } from "@/lib/auth";

// GET — List all HM memberships, optionally filtered by companyId
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;

    const memberships = await prisma.hiringManagerMembership.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, logoUrl: true } },
      },
      orderBy: { grantedAt: "desc" },
    });

    return NextResponse.json({ memberships });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST — Grant HM membership to a company
export async function POST(request: NextRequest) {
  try {
    await requireRole(["admin"]);
    const { user } = await getAuthenticatedUser();

    const body = await request.json();
    const { userId, email, companyId, role, expiresAt } = body as {
      userId: string;
      email: string;
      companyId: string;
      role?: string;
      expiresAt?: string;
    };

    if (!userId || !email || !companyId) {
      return NextResponse.json(
        { error: "userId, email, and companyId are required" },
        { status: 400 }
      );
    }

    // Verify company exists
    const company = await prisma.client.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Create or update membership
    const membership = await prisma.hiringManagerMembership.upsert({
      where: { userId_companyId: { userId, companyId } },
      create: {
        userId,
        email,
        companyId,
        role: role || "viewer",
        grantedBy: user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
      update: {
        email,
        role: role || undefined,
        isActive: true,
        grantedBy: user.id,
        grantedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });

    return NextResponse.json({ membership });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE — Revoke HM membership
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    await prisma.hiringManagerMembership.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

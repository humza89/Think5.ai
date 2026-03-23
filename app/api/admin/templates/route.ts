import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

// GET — List all templates with governance metadata
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const companyId = searchParams.get("companyId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;

    const templates = await prisma.interviewTemplate.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        recruiter: { select: { id: true, name: true } },
        _count: { select: { interviews: true, invitations: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH — Update template status (DRAFT → ACTIVE → ARCHIVED lifecycle)
export async function PATCH(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const body = await request.json();
    const { templateId, status: newStatus } = body as {
      templateId: string;
      status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    };

    if (!templateId || !newStatus) {
      return NextResponse.json(
        { error: "templateId and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      select: { status: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Validate transitions: DRAFT→ACTIVE, ACTIVE→ARCHIVED, ARCHIVED→DRAFT
    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ["ACTIVE"],
      ACTIVE: ["ARCHIVED", "DRAFT"],
      ARCHIVED: ["DRAFT"],
    };

    const allowed = allowedTransitions[template.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${template.status} to ${newStatus}. Allowed: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await prisma.interviewTemplate.update({
      where: { id: templateId },
      data: { status: newStatus as any },
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

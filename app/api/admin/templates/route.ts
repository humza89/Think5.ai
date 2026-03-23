import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getAuthenticatedUser } from "@/lib/auth";

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

// PATCH — Update template status with approval workflow
// Supports: DRAFT→PENDING_APPROVAL, PENDING_APPROVAL→ACTIVE (approve),
//           PENDING_APPROVAL→DRAFT (reject), ACTIVE→ARCHIVED, ARCHIVED→DRAFT
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireRole(["admin"]);

    const body = await request.json();
    const { templateId, status: newStatus, approvalNotes } = body as {
      templateId: string;
      status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "ARCHIVED";
      approvalNotes?: string;
    };

    if (!templateId || !newStatus) {
      return NextResponse.json(
        { error: "templateId and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "ARCHIVED"];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      select: { status: true, version: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Valid state transitions with approval gate
    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ["PENDING_APPROVAL"],
      PENDING_APPROVAL: ["ACTIVE", "DRAFT"], // ACTIVE = approve, DRAFT = reject
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

    // Build update data
    const updateData: Record<string, unknown> = { status: newStatus };

    // If approving (PENDING_APPROVAL → ACTIVE), record approval metadata
    if (template.status === "PENDING_APPROVAL" && newStatus === "ACTIVE") {
      const { user: currentUser } = await getAuthenticatedUser();
      updateData.approvedBy = currentUser?.id || "admin";
      updateData.approvedAt = new Date();
      updateData.approvalNotes = approvalNotes || null;
      updateData.version = (template.version || 1) + 1;
    }

    // If rejecting (PENDING_APPROVAL → DRAFT), clear approval fields
    if (template.status === "PENDING_APPROVAL" && newStatus === "DRAFT") {
      updateData.approvedBy = null;
      updateData.approvedAt = null;
      updateData.approvalNotes = approvalNotes || null;
    }

    const updated = await prisma.interviewTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

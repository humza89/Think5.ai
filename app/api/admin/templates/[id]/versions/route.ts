/**
 * Template Version History & Rollback API
 *
 * GET  — List version history for a template
 * POST — Rollback to a previous version (creates new version)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getAuthenticatedUser } from "@/lib/auth";

// GET — List version history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"]);
    const { id: templateId } = await params;

    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, version: true, status: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const versions = await prisma.interviewTemplateVersion.findMany({
      where: { templateId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        changeNotes: true,
        promotedBy: true,
        promotedAt: true,
        isShadow: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ template, versions });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST — Rollback to a previous version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"]);
    const { id: templateId } = await params;

    const body = await request.json();
    const { versionId, notes } = body as {
      versionId: string;
      notes?: string;
    };

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    // Find the version to rollback to
    const targetVersion = await prisma.interviewTemplateVersion.findUnique({
      where: { id: versionId },
    });

    if (!targetVersion || targetVersion.templateId !== templateId) {
      return NextResponse.json(
        { error: "Version not found for this template" },
        { status: 404 }
      );
    }

    const snapshot = targetVersion.snapshot as Record<string, unknown>;
    const { user: currentUser } = await getAuthenticatedUser();

    // Get current template version number
    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      select: { version: true },
    });

    const newVersion = (template?.version || 1) + 1;

    // Apply the snapshot back to the template
    await prisma.interviewTemplate.update({
      where: { id: templateId },
      data: {
        name: snapshot.name as string,
        description: (snapshot.description as string) || null,
        roleType: (snapshot.roleType as string) || null,
        durationMinutes: (snapshot.durationMinutes as number) || 30,
        questions: snapshot.questions ?? [],
        aiConfig: snapshot.aiConfig ?? {},
        strategicObjectives: snapshot.strategicObjectives ?? null,
        customScreeningQuestions: snapshot.customScreeningQuestions ?? null,
        scoringWeights: snapshot.scoringWeights ?? null,
        maxDurationMinutes: (snapshot.maxDurationMinutes as number) || 45,
        minDurationMinutes: (snapshot.minDurationMinutes as number) || 15,
        candidateReportPolicy: snapshot.candidateReportPolicy ?? null,
        retakePolicy: snapshot.retakePolicy ?? null,
        readinessCheckRequired: (snapshot.readinessCheckRequired as boolean) || false,
        version: newVersion,
        status: "DRAFT", // Rollback always goes to DRAFT for re-approval
      },
    });

    // Deactivate all versions
    await prisma.interviewTemplateVersion.updateMany({
      where: { templateId, isActive: true },
      data: { isActive: false },
    });

    // Create a new version record for the rollback
    const rollbackVersion = await prisma.interviewTemplateVersion.create({
      data: {
        templateId,
        version: newVersion,
        snapshot: targetVersion.snapshot as object,
        changeNotes: notes || `Rollback to version ${targetVersion.version}`,
        promotedBy: currentUser?.id || "admin",
        isActive: false, // Not active until re-approved
        isShadow: false,
      },
    });

    return NextResponse.json({
      success: true,
      newVersion,
      rollbackVersion,
      message: `Rolled back to version ${targetVersion.version}. Template is now DRAFT and requires re-approval.`,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;

    const template = await prisma.interviewTemplate.findUnique({
      where: { id },
      include: {
        recruiter: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { interviews: true, invitations: true } },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const template = await prisma.interviewTemplate.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.roleType !== undefined && { roleType: body.roleType }),
        ...(body.durationMinutes && { durationMinutes: body.durationMinutes }),
        ...(body.questions && { questions: body.questions }),
        ...(body.aiConfig && { aiConfig: body.aiConfig }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        ...(body.mode !== undefined && { mode: body.mode }),
        ...(body.strategicObjectives !== undefined && { strategicObjectives: body.strategicObjectives }),
        ...(body.customScreeningQuestions !== undefined && { customScreeningQuestions: body.customScreeningQuestions }),
        ...(body.candidateReportPolicy !== undefined && { candidateReportPolicy: body.candidateReportPolicy }),
        ...(body.retakePolicy !== undefined && { retakePolicy: body.retakePolicy }),
        ...(body.scoringWeights !== undefined && { scoringWeights: body.scoringWeights }),
        ...(body.maxDurationMinutes !== undefined && { maxDurationMinutes: body.maxDurationMinutes }),
        ...(body.minDurationMinutes !== undefined && { minDurationMinutes: body.minDurationMinutes }),
      },
      include: {
        recruiter: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;

    await prisma.interviewTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

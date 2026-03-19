import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["admin"]);

    const policy = await prisma.retentionPolicy.findFirst({
      where: { isDefault: true },
    });

    if (!policy) {
      return NextResponse.json(
        { error: "No default retention policy found" },
        { status: 404 }
      );
    }

    return NextResponse.json(policy);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const body = await request.json();
    const { recordingDays, transcriptDays, candidateDataDays } = body;

    // Validate input
    if (
      (recordingDays !== undefined && (typeof recordingDays !== "number" || recordingDays < 1)) ||
      (transcriptDays !== undefined && (typeof transcriptDays !== "number" || transcriptDays < 1)) ||
      (candidateDataDays !== undefined && (typeof candidateDataDays !== "number" || candidateDataDays < 1))
    ) {
      return NextResponse.json(
        { error: "Retention days must be positive integers" },
        { status: 400 }
      );
    }

    // Find or create the default policy
    let policy = await prisma.retentionPolicy.findFirst({
      where: { isDefault: true },
    });

    const updateData: Record<string, unknown> = {};
    if (recordingDays !== undefined) updateData.recordingDays = recordingDays;
    if (transcriptDays !== undefined) updateData.transcriptDays = transcriptDays;
    if (candidateDataDays !== undefined) updateData.candidateDataDays = candidateDataDays;

    if (policy) {
      policy = await prisma.retentionPolicy.update({
        where: { id: policy.id },
        data: updateData,
      });
    } else {
      policy = await prisma.retentionPolicy.create({
        data: {
          name: "Default",
          isDefault: true,
          ...updateData,
        },
      });
    }

    return NextResponse.json(policy);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

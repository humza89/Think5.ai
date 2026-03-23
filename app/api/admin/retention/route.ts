import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { enforceRetentionPolicies, getRetentionStatus } from "@/lib/retention-enforcement";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") || undefined;

    const status = await getRetentionStatus(companyId);
    return NextResponse.json(status);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const body = await request.json();
    const { recordingDays, transcriptDays, candidateDataDays, companyId } = body;

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

    const updateData: Record<string, unknown> = {};
    if (recordingDays !== undefined) updateData.recordingDays = recordingDays;
    if (transcriptDays !== undefined) updateData.transcriptDays = transcriptDays;
    if (candidateDataDays !== undefined) updateData.candidateDataDays = candidateDataDays;

    let policy;

    if (companyId) {
      // Company-specific policy
      policy = await prisma.retentionPolicy.findUnique({
        where: { companyId },
      });

      if (policy) {
        policy = await prisma.retentionPolicy.update({
          where: { id: policy.id },
          data: updateData,
        });
      } else {
        // Verify company exists
        const company = await prisma.client.findUnique({ where: { id: companyId } });
        if (!company) {
          return NextResponse.json({ error: "Company not found" }, { status: 404 });
        }
        policy = await prisma.retentionPolicy.create({
          data: {
            name: `${company.name} Policy`,
            companyId,
            ...updateData,
          },
        });
      }
    } else {
      // Default (global) policy
      policy = await prisma.retentionPolicy.findFirst({
        where: { isDefault: true },
      });

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
    }

    return NextResponse.json(policy);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: Trigger retention policy enforcement
export async function POST() {
  try {
    await requireRole(["admin"]);
    const result = await enforceRetentionPolicies();
    return NextResponse.json(result);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

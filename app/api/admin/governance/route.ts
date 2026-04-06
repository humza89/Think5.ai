/**
 * AI Decision Governance Policy API
 *
 * GET:   View governance policy for admin's company
 * PATCH: Update governance policy settings
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

async function resolveAdminCompanyId(userId: string): Promise<string | null> {
  const recruiter = await prisma.recruiter.findFirst({
    where: { supabaseUserId: userId },
    select: { companyId: true },
  });
  return recruiter?.companyId ?? null;
}

export async function GET() {
  try {
    const { user } = await requireRole(["admin"]);

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const policy = await prisma.governancePolicy.findUnique({
      where: { companyId },
    });

    if (!policy) {
      return NextResponse.json({
        policy: {
          canOverrideScore: ["admin"],
          canRedactTranscript: ["admin"],
          canSuppressReport: ["admin"],
          requireReviewBelow: null,
          autoPublishAbove: null,
          enforced: true,
          isDefault: true,
        },
      });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireRole(["admin"]);

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = [
      "canOverrideScore",
      "canRedactTranscript",
      "canSuppressReport",
      "requireReviewBelow",
      "autoPublishAbove",
      "enforced",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Validate role arrays
        if (field.startsWith("can") && !Array.isArray(body[field])) {
          return NextResponse.json(
            { error: `${field} must be an array of role names` },
            { status: 400 }
          );
        }
        // Validate numeric thresholds
        if (
          (field === "requireReviewBelow" || field === "autoPublishAbove") &&
          body[field] !== null &&
          typeof body[field] !== "number"
        ) {
          return NextResponse.json(
            { error: `${field} must be a number or null` },
            { status: 400 }
          );
        }
        updateData[field] = body[field];
      }
    }

    // Validate threshold consistency
    const requireReview = updateData.requireReviewBelow as number | null | undefined;
    const autoPublish = updateData.autoPublishAbove as number | null | undefined;
    if (
      requireReview != null &&
      autoPublish != null &&
      requireReview >= autoPublish
    ) {
      return NextResponse.json(
        { error: "requireReviewBelow must be less than autoPublishAbove" },
        { status: 400 }
      );
    }

    // Also check against existing values if only one field is being updated
    if (requireReview != null || autoPublish != null) {
      const existing = await prisma.governancePolicy.findUnique({
        where: { companyId },
        select: { requireReviewBelow: true, autoPublishAbove: true },
      });

      const effectiveReview = requireReview ?? existing?.requireReviewBelow;
      const effectivePublish = autoPublish ?? existing?.autoPublishAbove;

      if (
        effectiveReview != null &&
        effectivePublish != null &&
        effectiveReview >= effectivePublish
      ) {
        return NextResponse.json(
          { error: "requireReviewBelow must be less than autoPublishAbove" },
          { status: 400 }
        );
      }
    }

    const policy = await prisma.governancePolicy.upsert({
      where: { companyId },
      create: { companyId, ...updateData },
      update: updateData,
    });

    // Audit trail: log every policy change
    await logActivity({
      userId: user.id,
      userRole: "admin",
      action: "governance.policy_updated",
      entityType: "GovernancePolicy",
      entityId: policy.id,
      metadata: { updatedFields: Object.keys(updateData), newValues: updateData },
    });

    return NextResponse.json({ policy });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

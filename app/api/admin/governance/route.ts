/**
 * AI Decision Governance Policy API
 *
 * GET:   View governance policy for admin's company
 * PATCH: Update governance policy settings
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

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

    const policy = await prisma.governancePolicy.upsert({
      where: { companyId },
      create: { companyId, ...updateData },
      update: updateData,
    });

    return NextResponse.json({ policy });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

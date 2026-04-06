import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { SCORER_MODEL_VERSION, getScorerPromptHash } from "@/lib/gemini";
import { getSkillModulesHash } from "@/lib/skill-modules";

export async function GET() {
  try {
    await requireRole(["admin"]);

    // Get current configuration
    const currentConfig = {
      scorerModelVersion: SCORER_MODEL_VERSION,
      promptHash: getScorerPromptHash(),
      rubricHash: getSkillModulesHash(),
    };

    // Get report counts grouped by model version
    const versionDistribution = await prisma.interviewReport.groupBy({
      by: ["scorerModelVersion"],
      _count: { scorerModelVersion: true },
      orderBy: { _count: { scorerModelVersion: "desc" } },
    });

    // Get the most recent report date per version
    const recentReports = await prisma.interviewReport.findMany({
      where: { scorerModelVersion: { not: null } },
      select: {
        scorerModelVersion: true,
        scorerPromptVersion: true,
        rubricVersion: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Build version details with latest prompt/rubric hashes
    const versionDetails: Record<string, {
      count: number;
      latestPromptHash: string | null;
      latestRubricHash: string | null;
      lastUsed: string | null;
    }> = {};

    for (const dist of versionDistribution) {
      const version = dist.scorerModelVersion || "unknown";
      const latestForVersion = recentReports.find(
        (r: { scorerModelVersion: string | null }) => r.scorerModelVersion === dist.scorerModelVersion
      );
      versionDetails[version] = {
        count: dist._count.scorerModelVersion,
        latestPromptHash: latestForVersion?.scorerPromptVersion || null,
        latestRubricHash: latestForVersion?.rubricVersion || null,
        lastUsed: latestForVersion?.createdAt?.toISOString() || null,
      };
    }

    // Total reports
    const totalReports = await prisma.interviewReport.count();

    return NextResponse.json({
      current: currentConfig,
      totalReports,
      versionDistribution: versionDetails,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// ── POST: Set active model version ───────────────────────────────────

const setModelVersionSchema = z.object({
  modelVersion: z.string().min(1),
  companyId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["admin"]);

    const body = await request.json();
    const parsed = setModelVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { modelVersion, companyId } = parsed.data;

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required to update governance policy" },
        { status: 400 }
      );
    }

    const previousPolicy = await prisma.governancePolicy.findUnique({
      where: { companyId },
      select: { activeModelVersion: true },
    });

    const policy = await prisma.governancePolicy.upsert({
      where: { companyId },
      update: { activeModelVersion: modelVersion },
      create: {
        companyId,
        activeModelVersion: modelVersion,
      },
    });

    // Log the change
    await prisma.activityLog.create({
      data: {
        action: "model_governance.set_active_version",
        performedBy: (session as { userId?: string }).userId ?? "admin",
        metadata: {
          companyId,
          previousVersion: previousPolicy?.activeModelVersion ?? null,
          newVersion: modelVersion,
          changedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      companyId,
      activeModelVersion: policy.activeModelVersion,
      previousVersion: previousPolicy?.activeModelVersion ?? null,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// ── PUT: Rollback to previous model version ──────────────────────────

const rollbackSchema = z.object({
  rollbackTo: z.string().min(1),
  companyId: z.string().uuid().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(["admin"]);

    const body = await request.json();
    const parsed = rollbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rollbackTo, companyId } = parsed.data;

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required to rollback governance policy" },
        { status: 400 }
      );
    }

    const previousPolicy = await prisma.governancePolicy.findUnique({
      where: { companyId },
      select: { activeModelVersion: true },
    });

    const policy = await prisma.governancePolicy.upsert({
      where: { companyId },
      update: { activeModelVersion: rollbackTo },
      create: {
        companyId,
        activeModelVersion: rollbackTo,
      },
    });

    // Log the rollback
    await prisma.activityLog.create({
      data: {
        action: "model_governance.rollback_version",
        performedBy: (session as { userId?: string }).userId ?? "admin",
        metadata: {
          companyId,
          rolledBackFrom: previousPolicy?.activeModelVersion ?? null,
          rolledBackTo: rollbackTo,
          changedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      companyId,
      activeModelVersion: policy.activeModelVersion,
      rolledBackFrom: previousPolicy?.activeModelVersion ?? null,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

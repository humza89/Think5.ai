import { NextResponse } from "next/server";
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

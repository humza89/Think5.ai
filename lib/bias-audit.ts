import { prisma } from "@/lib/prisma";

export interface BiasAuditRecord {
  interviewDate: string;
  interviewType: string;
  overallScore: number | null;
  recommendation: string | null;
  domainExpertise: number | null;
  problemSolving: number | null;
  communicationScore: number | null;
  scorerModelVersion: string | null;
  demographicData?: Record<string, unknown> | null;
}

export async function generateBiasAuditExport(options?: { startDate?: Date; endDate?: Date; includeDemographics?: boolean }): Promise<BiasAuditRecord[]> {
  const where: Record<string, unknown> = {
    interview: { status: "COMPLETED" },
  };

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) (where.createdAt as Record<string, Date>).gte = options.startDate;
    if (options.endDate) (where.createdAt as Record<string, Date>).lte = options.endDate;
  }

  const reports = await prisma.interviewReport.findMany({
    where,
    select: {
      createdAt: true,
      overallScore: true,
      recommendation: true,
      domainExpertise: true,
      problemSolving: true,
      communicationScore: true,
      scorerModelVersion: true,
      interview: {
        select: {
          type: true,
          ...(options?.includeDemographics ? {
            candidate: {
              select: {
                demographicData: true,
                demographicConsentGiven: true,
              },
            },
          } : {}),
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports.map((r: typeof reports[number]) => {
    const candidate = (r.interview as any).candidate;
    return {
      interviewDate: r.createdAt.toISOString().split("T")[0],
      interviewType: r.interview.type,
      overallScore: r.overallScore,
      recommendation: r.recommendation,
      domainExpertise: r.domainExpertise,
      problemSolving: r.problemSolving,
      communicationScore: r.communicationScore,
      scorerModelVersion: r.scorerModelVersion,
      // Only include demographics when explicitly requested and candidate consented
      ...(options?.includeDemographics && candidate?.demographicConsentGiven
        ? { demographicData: candidate.demographicData as Record<string, unknown> | null }
        : {}),
    };
  });
}

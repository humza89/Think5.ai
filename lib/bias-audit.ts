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

// ── Bias Audit Analysis (4/5ths Rule) ─────────────────────────────────

export interface GroupStats {
  group: string;
  count: number;
  meanScore: number;
  passRate: number; // Fraction of YES/STRONG_YES recommendations
  passCount: number;
}

export interface AdverseImpactResult {
  dimension: string;
  groups: GroupStats[];
  adverseImpactRatio: number; // min_pass_rate / max_pass_rate
  adverseImpactDetected: boolean; // true if ratio < 0.8
  totalCandidates: number;
}

export interface BiasAuditAnalysis {
  startDate: string;
  endDate: string;
  totalInterviews: number;
  totalWithDemographics: number;
  results: AdverseImpactResult[];
  adverseImpactDetected: boolean;
  generatedAt: string;
}

export async function runBiasAuditAnalysis(options: {
  startDate: Date;
  endDate: Date;
}): Promise<BiasAuditAnalysis> {
  const records = await generateBiasAuditExport({
    startDate: options.startDate,
    endDate: options.endDate,
    includeDemographics: true,
  });

  const withDemographics = records.filter(
    (r) => r.demographicData && Object.keys(r.demographicData).length > 0
  );

  // Group by each demographic dimension
  const dimensions = new Set<string>();
  for (const record of withDemographics) {
    if (record.demographicData) {
      for (const key of Object.keys(record.demographicData)) {
        dimensions.add(key);
      }
    }
  }

  const results: AdverseImpactResult[] = [];

  for (const dimension of dimensions) {
    const groups = new Map<string, { scores: number[]; passes: number; total: number }>();

    for (const record of withDemographics) {
      const value = record.demographicData?.[dimension];
      if (!value || typeof value !== "string") continue;

      if (!groups.has(value)) {
        groups.set(value, { scores: [], passes: 0, total: 0 });
      }

      const group = groups.get(value)!;
      group.total++;
      if (record.overallScore != null) group.scores.push(record.overallScore);
      if (record.recommendation === "YES" || record.recommendation === "STRONG_YES") {
        group.passes++;
      }
    }

    // Need at least 2 groups with data
    if (groups.size < 2) continue;

    const groupStats: GroupStats[] = [];
    let maxPassRate = 0;
    let minPassRate = 1;

    for (const [name, data] of groups) {
      const meanScore = data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0;
      const passRate = data.total > 0 ? data.passes / data.total : 0;

      if (data.total >= 5) {
        // Only consider groups with sufficient sample size
        maxPassRate = Math.max(maxPassRate, passRate);
        minPassRate = Math.min(minPassRate, passRate);
      }

      groupStats.push({
        group: name,
        count: data.total,
        meanScore: Math.round(meanScore * 10) / 10,
        passRate: Math.round(passRate * 1000) / 1000,
        passCount: data.passes,
      });
    }

    const adverseImpactRatio = maxPassRate > 0
      ? Math.round((minPassRate / maxPassRate) * 1000) / 1000
      : 1;

    results.push({
      dimension,
      groups: groupStats,
      adverseImpactRatio,
      adverseImpactDetected: adverseImpactRatio < 0.8,
      totalCandidates: withDemographics.length,
    });
  }

  return {
    startDate: options.startDate.toISOString().split("T")[0],
    endDate: options.endDate.toISOString().split("T")[0],
    totalInterviews: records.length,
    totalWithDemographics: withDemographics.length,
    results,
    adverseImpactDetected: results.some((r) => r.adverseImpactDetected),
    generatedAt: new Date().toISOString(),
  };
}

// ── Bias Audit Export ─────────────────────────────────────────────────

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

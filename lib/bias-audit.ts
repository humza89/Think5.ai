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

// ── Intersectional Bias Audit (2K) ───────────────────────────────────

export interface WilsonInterval {
  lower: number;
  upper: number;
  point: number;
}

export interface IntersectionalGroupStats {
  dimensions: string[];       // e.g. ["gender", "ethnicity"]
  group: string;              // e.g. "female_hispanic"
  count: number;
  passRate: number;
  passCount: number;
  confidenceInterval: WilsonInterval;
}

export interface IntersectionalResult {
  dimensionPair: [string, string];
  groups: IntersectionalGroupStats[];
  adverseImpactRatio: number;
  adverseImpactDetected: boolean;
}

export interface TrendComparison {
  group: string;
  dimension: string;
  currentPassRate: number;
  baselinePassRate: number | null; // null if no baseline data
  delta: number | null;
}

export interface IntersectionalBiasAuditAnalysis extends BiasAuditAnalysis {
  intersectionalResults: IntersectionalResult[];
  confidenceIntervals: Record<string, WilsonInterval>; // keyed by "dimension:group"
  trendComparisons: TrendComparison[];
}

/**
 * Wilson score confidence interval for a binomial proportion.
 * Returns lower and upper bounds at the given z-level (default 1.96 for 95% CI).
 */
function wilsonInterval(successes: number, total: number, z = 1.96): WilsonInterval {
  if (total === 0) return { lower: 0, upper: 0, point: 0 };

  const pHat = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = pHat + z2 / (2 * total);
  const margin = z * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * total)) / total);

  return {
    lower: Math.max(0, Math.round(((center - margin) / denominator) * 1000) / 1000),
    upper: Math.min(1, Math.round(((center + margin) / denominator) * 1000) / 1000),
    point: Math.round(pHat * 1000) / 1000,
  };
}

export async function runIntersectionalBiasAudit(options: {
  startDate: Date;
  endDate: Date;
}): Promise<IntersectionalBiasAuditAnalysis> {
  // Run the standard bias audit first
  const baseResult = await runBiasAuditAnalysis(options);

  // Fetch records with demographics for intersectional analysis
  const records = await generateBiasAuditExport({
    startDate: options.startDate,
    endDate: options.endDate,
    includeDemographics: true,
  });

  const withDemographics = records.filter(
    (r) => r.demographicData && Object.keys(r.demographicData).length > 0
  );

  // Collect all demographic dimensions
  const dimensions = new Set<string>();
  for (const record of withDemographics) {
    if (record.demographicData) {
      for (const key of Object.keys(record.demographicData)) {
        dimensions.add(key);
      }
    }
  }

  const dimensionList = Array.from(dimensions);
  const intersectionalResults: IntersectionalResult[] = [];
  const confidenceIntervals: Record<string, WilsonInterval> = {};

  // Single-dimension confidence intervals
  for (const result of baseResult.results) {
    for (const group of result.groups) {
      const ci = wilsonInterval(group.passCount, group.count);
      confidenceIntervals[`${result.dimension}:${group.group}`] = ci;
    }
  }

  // Multi-factor analysis: for each pair of demographic dimensions
  for (let i = 0; i < dimensionList.length; i++) {
    for (let j = i + 1; j < dimensionList.length; j++) {
      const dimA = dimensionList[i];
      const dimB = dimensionList[j];

      const groups = new Map<string, { passes: number; total: number }>();

      for (const record of withDemographics) {
        const valA = record.demographicData?.[dimA];
        const valB = record.demographicData?.[dimB];
        if (!valA || typeof valA !== "string" || !valB || typeof valB !== "string") continue;

        const key = `${valA}_${valB}`;
        if (!groups.has(key)) {
          groups.set(key, { passes: 0, total: 0 });
        }

        const group = groups.get(key)!;
        group.total++;
        if (record.recommendation === "YES" || record.recommendation === "STRONG_YES") {
          group.passes++;
        }
      }

      if (groups.size < 2) continue;

      const groupStats: IntersectionalGroupStats[] = [];
      let maxPassRate = 0;
      let minPassRate = 1;

      for (const [name, data] of groups) {
        const passRate = data.total > 0 ? data.passes / data.total : 0;
        const ci = wilsonInterval(data.passes, data.total);

        if (data.total >= 5) {
          maxPassRate = Math.max(maxPassRate, passRate);
          minPassRate = Math.min(minPassRate, passRate);
        }

        groupStats.push({
          dimensions: [dimA, dimB],
          group: name,
          count: data.total,
          passRate: Math.round(passRate * 1000) / 1000,
          passCount: data.passes,
          confidenceInterval: ci,
        });

        confidenceIntervals[`${dimA}+${dimB}:${name}`] = ci;
      }

      const adverseImpactRatio = maxPassRate > 0
        ? Math.round((minPassRate / maxPassRate) * 1000) / 1000
        : 1;

      intersectionalResults.push({
        dimensionPair: [dimA, dimB],
        groups: groupStats,
        adverseImpactRatio,
        adverseImpactDetected: adverseImpactRatio < 0.8,
      });
    }
  }

  // Trend analysis placeholder: compare current period vs baseline (last 90 days)
  const trendComparisons: TrendComparison[] = [];
  const baselineStart = new Date(options.startDate);
  baselineStart.setDate(baselineStart.getDate() - 90);
  const baselineEnd = new Date(options.startDate);
  baselineEnd.setDate(baselineEnd.getDate() - 1);

  // Only compute trends if baseline period is valid
  if (baselineStart < baselineEnd) {
    const baselineRecords = await generateBiasAuditExport({
      startDate: baselineStart,
      endDate: baselineEnd,
      includeDemographics: true,
    });

    const baselineWithDemo = baselineRecords.filter(
      (r) => r.demographicData && Object.keys(r.demographicData).length > 0
    );

    for (const result of baseResult.results) {
      for (const group of result.groups) {
        // Compute baseline pass rate for this dimension:group
        const baselineGroup = baselineWithDemo.filter((r) => {
          const val = r.demographicData?.[result.dimension];
          return typeof val === "string" && val === group.group;
        });

        const baselineTotal = baselineGroup.length;
        const baselinePasses = baselineGroup.filter(
          (r) => r.recommendation === "YES" || r.recommendation === "STRONG_YES"
        ).length;

        const baselinePassRate = baselineTotal >= 5
          ? Math.round((baselinePasses / baselineTotal) * 1000) / 1000
          : null;

        trendComparisons.push({
          group: group.group,
          dimension: result.dimension,
          currentPassRate: group.passRate,
          baselinePassRate,
          delta: baselinePassRate != null
            ? Math.round((group.passRate - baselinePassRate) * 1000) / 1000
            : null,
        });
      }
    }
  }

  return {
    ...baseResult,
    adverseImpactDetected:
      baseResult.adverseImpactDetected ||
      intersectionalResults.some((r) => r.adverseImpactDetected),
    intersectionalResults,
    confidenceIntervals,
    trendComparisons,
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

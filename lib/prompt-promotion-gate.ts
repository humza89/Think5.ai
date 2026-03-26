/**
 * Prompt Promotion Gate
 *
 * Ensures prompt/model updates meet quality thresholds before
 * being promoted to production. Acts as a programmatic gate
 * in the CI/CD pipeline.
 */

export interface PromotionInput {
  evalResults: {
    overallPassed: boolean;
    avgScore: number;
    results: Array<{
      dimensionScores: Record<string, number>;
      weightedScore: number;
    }>;
  };
  qaScores?: {
    compositeScore: number;
    dimensions: Array<{ name: string; score: number }>;
  };
}

export interface PromotionResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

const THRESHOLDS = {
  minWeightedEvalScore: 7.5,
  minRealismScore: 7.5,
  minSignalExtractionScore: 7.0,
  minDimensionScore: 5.0,
  minQACompositeScore: 6.0,
};

/**
 * Check if eval + QA results meet promotion thresholds.
 */
export function checkPromotionReadiness(input: PromotionInput): PromotionResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check overall eval score
  if (input.evalResults.avgScore < THRESHOLDS.minWeightedEvalScore) {
    blockers.push(
      `Avg eval score ${input.evalResults.avgScore.toFixed(1)} < ${THRESHOLDS.minWeightedEvalScore} threshold`
    );
  }

  // Check if eval passed
  if (!input.evalResults.overallPassed) {
    blockers.push("Eval harness did not pass");
  }

  // Check individual dimensions across all results
  for (const result of input.evalResults.results) {
    for (const [dimId, score] of Object.entries(result.dimensionScores)) {
      if (score < THRESHOLDS.minDimensionScore) {
        blockers.push(`Dimension "${dimId}" scored ${score.toFixed(1)} < ${THRESHOLDS.minDimensionScore} minimum`);
      }
    }

    // Check realism specifically
    const realismScore = result.dimensionScores.realism;
    if (realismScore !== undefined && realismScore < THRESHOLDS.minRealismScore) {
      blockers.push(
        `Recruiter realism ${realismScore.toFixed(1)} < ${THRESHOLDS.minRealismScore} threshold`
      );
    }

    // Check signal extraction specifically
    const signalScore = result.dimensionScores.signal_extraction;
    if (signalScore !== undefined && signalScore < THRESHOLDS.minSignalExtractionScore) {
      blockers.push(
        `Signal extraction ${signalScore.toFixed(1)} < ${THRESHOLDS.minSignalExtractionScore} threshold`
      );
    }
  }

  // Check QA scores if available
  if (input.qaScores) {
    if (input.qaScores.compositeScore < THRESHOLDS.minQACompositeScore) {
      blockers.push(
        `Transcript QA composite ${input.qaScores.compositeScore.toFixed(1)} < ${THRESHOLDS.minQACompositeScore} threshold`
      );
    }

    // Critical QA dimensions are blockers, not warnings
    const criticalQADimensions = ["flow_realism", "signal_extraction", "probing_depth"];
    for (const dim of input.qaScores.dimensions) {
      if (criticalQADimensions.includes(dim.name) && dim.score < 4) {
        blockers.push(`Critical QA dimension "${dim.name}" scored ${dim.score}/10 < 4 minimum`);
      } else if (dim.score < 4) {
        warnings.push(`QA dimension "${dim.name}" scored ${dim.score}/10 — needs attention`);
      }
    }
  }

  // Deduplicate blockers
  const uniqueBlockers = [...new Set(blockers)];

  return {
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    warnings,
  };
}

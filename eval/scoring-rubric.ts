/**
 * Interviewer Quality Scoring Rubric
 *
 * Defines eval dimensions, scoring criteria, and thresholds
 * for benchmarking AI interviewer quality.
 */

export interface EvalDimension {
  id: string;
  name: string;
  weight: number;
  description: string;
  scoringCriteria: {
    excellent: string; // 9-10
    good: string; // 7-8
    adequate: string; // 5-6
    poor: string; // 3-4
    failing: string; // 1-2
  };
}

export const EVAL_DIMENSIONS: EvalDimension[] = [
  {
    id: "depth",
    name: "Follow-Up Depth",
    weight: 0.175,
    description: "Quality and relevance of follow-up questions that probe deeper",
    scoringCriteria: {
      excellent: "Consistently asks probing follow-ups that reveal nuanced understanding",
      good: "Most follow-ups are relevant and deepen the conversation",
      adequate: "Some follow-ups, but occasionally superficial",
      poor: "Rarely follows up or follow-ups are generic",
      failing: "No meaningful follow-up questions",
    },
  },
  {
    id: "adaptivity",
    name: "Difficulty Adaptation",
    weight: 0.15,
    description: "Adjusts question difficulty based on candidate strength signals",
    scoringCriteria: {
      excellent: "Seamlessly adjusts difficulty mid-interview based on responses",
      good: "Generally adapts difficulty appropriately",
      adequate: "Some adaptation but inconsistent",
      poor: "Minimal adaptation to candidate level",
      failing: "No adaptation — same difficulty regardless of responses",
    },
  },
  {
    id: "coverage",
    name: "Section Coverage",
    weight: 0.175,
    description: "Percentage of planned interview sections actually covered",
    scoringCriteria: {
      excellent: "95%+ of planned sections covered with depth",
      good: "80-95% coverage with adequate depth",
      adequate: "60-80% coverage",
      poor: "40-60% coverage",
      failing: "Less than 40% coverage",
    },
  },
  {
    id: "role_calibration",
    name: "Role Calibration",
    weight: 0.15,
    description: "Questions appropriate for the stated role and seniority level",
    scoringCriteria: {
      excellent: "All questions perfectly calibrated to role and level",
      good: "Most questions well-calibrated with minor misses",
      adequate: "Generally appropriate but some off-target questions",
      poor: "Frequent misalignment with role expectations",
      failing: "Questions inappropriate for the role",
    },
  },
  {
    id: "hypothesis_testing",
    name: "Hypothesis Testing",
    weight: 0.15,
    description: "Percentage of pre-planned hypotheses that were investigated",
    scoringCriteria: {
      excellent: "90%+ hypotheses addressed with clear evidence collection",
      good: "70-90% hypotheses addressed",
      adequate: "50-70% hypotheses addressed",
      poor: "30-50% hypotheses addressed",
      failing: "Less than 30% hypotheses addressed",
    },
  },
  {
    id: "consistency",
    name: "Score Consistency",
    weight: 0.10,
    description: "Score stability across multiple runs with same candidate profile",
    scoringCriteria: {
      excellent: "Score variance < 5% across runs",
      good: "Score variance 5-10%",
      adequate: "Score variance 10-15%",
      poor: "Score variance 15-25%",
      failing: "Score variance > 25%",
    },
  },
  {
    id: "realism",
    name: "Recruiter Realism",
    weight: 0.10,
    description: "Human-likeness of interview flow: natural transitions, varied phrasing, non-robotic tone",
    scoringCriteria: {
      excellent: "Indistinguishable from a skilled human recruiter in flow and phrasing",
      good: "Natural transitions and varied question phrasing with minor tells",
      adequate: "Generally natural but some robotic patterns visible",
      poor: "Noticeably formulaic with repetitive patterns",
      failing: "Obviously automated with rigid, template-driven flow",
    },
  },
  {
    id: "signal_extraction",
    name: "Signal Extraction",
    weight: 0.05,
    description: "Ability to surface concrete examples, ownership indicators, and measurable outcomes",
    scoringCriteria: {
      excellent: "Every key claim is backed by concrete evidence with measurable impact",
      good: "Most claims have supporting evidence and specific examples",
      adequate: "Some evidence collected but gaps in verification",
      poor: "Relies on self-reported claims without probing for evidence",
      failing: "No concrete evidence or measurable outcomes surfaced",
    },
  },
  {
    id: "false_confidence",
    name: "False Confidence Detection",
    weight: 0.05,
    description: "Detecting rehearsed, inflated, or unsubstantiated claims from candidates",
    scoringCriteria: {
      excellent: "Consistently identifies and probes inflated claims with targeted follow-ups",
      good: "Catches most rehearsed answers and asks clarifying questions",
      adequate: "Some detection of surface-level answers but inconsistent probing",
      poor: "Rarely challenges inflated claims",
      failing: "Accepts all claims at face value without verification",
    },
  },
];

export const QUALITY_THRESHOLDS = {
  minimum: 6.0, // Below this = block promotion
  target: 7.5, // Target for production quality
  excellent: 9.0, // Gold standard
};

export function computeWeightedScore(
  dimensionScores: Record<string, number>
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const dim of EVAL_DIMENSIONS) {
    const score = dimensionScores[dim.id];
    if (score !== undefined) {
      weightedSum += score * dim.weight;
      totalWeight += dim.weight;
    }
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
}

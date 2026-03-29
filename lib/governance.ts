/**
 * AI Decision Governance — Policy Enforcement
 *
 * Configurable per-company policies controlling who can override,
 * redact, or suppress AI-generated interview scores and reports.
 */

import { prisma } from "@/lib/prisma";

export interface GovernancePolicyData {
  canOverrideScore: string[];
  canRedactTranscript: string[];
  canSuppressReport: string[];
  requireReviewBelow: number | null;
  autoPublishAbove: number | null;
  enforced: boolean;
}

const DEFAULT_POLICY: GovernancePolicyData = {
  canOverrideScore: ["admin"],
  canRedactTranscript: ["admin"],
  canSuppressReport: ["admin"],
  requireReviewBelow: 60, // All low-scoring reports require human review
  autoPublishAbove: 80,   // High-scoring reports auto-publish
  enforced: true,
};

/**
 * Get the governance policy for a company (returns defaults if none configured).
 */
export async function getGovernancePolicy(
  companyId: string
): Promise<GovernancePolicyData> {
  const policy = await prisma.governancePolicy.findUnique({
    where: { companyId },
  });

  if (!policy) return DEFAULT_POLICY;

  return {
    canOverrideScore: policy.canOverrideScore,
    canRedactTranscript: policy.canRedactTranscript,
    canSuppressReport: policy.canSuppressReport,
    requireReviewBelow: policy.requireReviewBelow,
    autoPublishAbove: policy.autoPublishAbove,
    enforced: policy.enforced,
  };
}

/**
 * Check if a user role has permission for a governance action.
 */
export function checkGovernancePermission(
  policy: GovernancePolicyData,
  action: "canOverrideScore" | "canRedactTranscript" | "canSuppressReport",
  userRole: string
): boolean {
  if (!policy.enforced) return true;
  return policy[action].includes(userRole);
}

/**
 * Determine if a report requires human review based on its score
 * and the company's governance policy.
 */
export function shouldRequireReview(
  policy: GovernancePolicyData,
  overallScore: number | null
): boolean {
  if (!policy.enforced || overallScore === null) return false;

  if (
    policy.requireReviewBelow !== null &&
    overallScore < policy.requireReviewBelow
  ) {
    return true;
  }

  return false;
}

/**
 * Determine if a report can be auto-published based on score and policy.
 */
export function canAutoPublish(
  policy: GovernancePolicyData,
  overallScore: number | null
): boolean {
  if (!policy.enforced || overallScore === null) return false;

  if (
    policy.autoPublishAbove !== null &&
    overallScore >= policy.autoPublishAbove
  ) {
    return true;
  }

  return false;
}

/**
 * Generate a conformance report comparing expected policy enforcement
 * against actual actions taken for an interview.
 */
export async function generateConformanceReport(interviewId: string): Promise<{
  interviewId: string;
  generatedAt: string;
  policy: GovernancePolicyData;
  enforcement: {
    reviewRequired: boolean;
    reviewApplied: boolean;
    autoPublishEligible: boolean;
    autoPublishApplied: boolean;
  };
  gaps: string[];
  conformant: boolean;
}> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      companyId: true,
      report: {
        select: {
          overallScore: true,
          reviewStatus: true,
          publishedAt: true,
        },
      },
    },
  });

  const policy = interview?.companyId
    ? await getGovernancePolicy(interview.companyId)
    : DEFAULT_POLICY;

  const score = interview?.report?.overallScore ?? null;
  const reviewStatus = interview?.report?.reviewStatus;

  const reviewRequired = shouldRequireReview(policy, score);
  const reviewApplied = reviewStatus === "PENDING_REVIEW" || reviewStatus === "REVIEWED";
  const autoPublishEligible = canAutoPublish(policy, score);
  const autoPublishApplied = !!interview?.report?.publishedAt;

  const gaps: string[] = [];
  if (reviewRequired && !reviewApplied) {
    gaps.push(`Report score ${score} requires review (threshold: ${policy.requireReviewBelow}) but review was not applied`);
  }
  if (autoPublishEligible && !autoPublishApplied) {
    gaps.push(`Report score ${score} eligible for auto-publish (threshold: ${policy.autoPublishAbove}) but was not auto-published`);
  }

  return {
    interviewId,
    generatedAt: new Date().toISOString(),
    policy,
    enforcement: {
      reviewRequired,
      reviewApplied,
      autoPublishEligible,
      autoPublishApplied,
    },
    gaps,
    conformant: gaps.length === 0,
  };
}

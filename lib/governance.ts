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
  requireReviewBelow: null,
  autoPublishAbove: null,
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

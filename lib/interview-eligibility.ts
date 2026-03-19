/**
 * Interview Eligibility Gating
 *
 * Validates that a candidate is eligible to start an official interview
 * beyond simple token validation. Checks onboarding/approval status.
 */

interface CandidateForEligibility {
  onboardingStatus?: string | null;
}

interface InterviewForEligibility {
  isPractice: boolean;
  candidate: CandidateForEligibility;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Check whether a candidate is eligible to start an interview.
 * Practice interviews skip this check.
 * Official interviews require candidate to have APPROVED onboarding status.
 */
export function checkCandidateEligibility(
  interview: InterviewForEligibility
): EligibilityResult {
  // Practice interviews are always allowed for authenticated candidates
  if (interview.isPractice) {
    return { eligible: true };
  }

  const status = interview.candidate?.onboardingStatus;

  // If onboarding status is not set, allow (backward compatibility for
  // candidates created before the onboarding system)
  if (!status) {
    return { eligible: true };
  }

  if (status === "APPROVED") {
    return { eligible: true };
  }

  const reasonMap: Record<string, string> = {
    REJECTED: "Candidate account has been rejected",
    ON_HOLD: "Candidate account is on hold pending review",
    PENDING_APPROVAL: "Candidate account is pending admin approval",
    PROFILE_STARTED: "Candidate has not completed onboarding",
    PROFILE_COMPLETED: "Candidate onboarding is pending approval",
    INVITED: "Candidate has not started onboarding",
  };

  return {
    eligible: false,
    reason: reasonMap[status] || `Candidate not approved for official interviews (status: ${status})`,
  };
}

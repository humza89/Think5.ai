/**
 * Single source of truth for the deterministic identities, IDs, tokens and
 * routes used by the Phase 0 golden suite. Imported by the seed script
 * (`scripts/e2e-seed.ts`), the Playwright auth setup project and the visual
 * spec so the three can never drift apart.
 *
 * Nothing here is a secret: the accounts exist only inside the throwaway local
 * Supabase stack that `supabase start` boots for a run.
 */

const ids = {
  company: "e2e-company-northwind",
  recruiter: "e2e-recruiter-riley",
  /** T14: recruiter row that the admin-approval spec approves and then resets. */
  pendingRecruiter: "e2e-recruiter-casey",
  candidate: "e2e-candidate-jordan",
  candidateB: "e2e-candidate-priya",
  candidateC: "e2e-candidate-samuel",
  job: "e2e-job-backend",
  application: "e2e-application-jordan-backend",
  invitation: "e2e-invitation-welcome",
  interviewWelcome: "e2e-interview-welcome",
  interviewCompleted: "e2e-interview-completed",
  /** T14: reserved for writes-invite-to-report (moves PENDING → REPORT_READY during the run). */
  interviewGolden: "e2e-interview-golden",
} as const;

export const E2E_FIXTURES = {
  /** Fixed clock for every seeded createdAt/appliedAt so rendered dates never drift. */
  seededAt: "2026-09-01T09:00:00.000Z",
  /** Far-future expiry keeps invitation + access tokens valid for every run. */
  neverExpires: "2099-01-01T00:00:00.000Z",
  recruiter: {
    email: "e2e-recruiter@think5.test",
    firstName: "Riley",
    lastName: "Chen",
    name: "Riley Chen",
  },
  candidate: {
    email: "e2e-candidate@think5.test",
    firstName: "Jordan",
    lastName: "Alvarez",
    fullName: "Jordan Alvarez",
  },
  /**
   * T9: a recruiter account reserved for the identity spec, which rotates its
   * password and enrols/removes MFA factors. Keeping that off the shared
   * recruiter means no other spec's session or sign-in can be disturbed.
   */
  identity: {
    email: "e2e-identity@think5.test",
    firstName: "Sam",
    lastName: "Okafor",
    name: "Sam Okafor",
  },
  /**
   * T14: platform admin (no Recruiter row, so the approvals API is not
   * tenant-scoped). Signs in through the real form in auth.setup.ts.
   */
  admin: {
    email: "e2e-admin@think5.test",
    firstName: "Morgan",
    lastName: "Lee",
    name: "Morgan Lee",
  },
  /**
   * T14: recruiter who finished onboarding and is waiting for approval
   * (Recruiter.onboardingStatus PENDING_APPROVAL, profiles.onboarding_status
   * pending_approval). writes-admin-approval.spec.ts approves and resets it.
   */
  pendingRecruiter: {
    email: "e2e-pending@think5.test",
    firstName: "Casey",
    lastName: "Park",
    name: "Casey Park",
  },
  /**
   * T14: account created by writes-signup-to-approval.spec.ts through the
   * real signup form. Never seeded; the seed and the spec remove leftovers.
   */
  signup: {
    email: "e2e-signup@think5.test",
    firstName: "Taylor",
    lastName: "Brooks",
    name: "Taylor Brooks",
    password: "E2e-signup-local-only-Pa55",
  },
  ids,
  tokens: {
    invitation: "e2e-invitation-token-0001",
    interviewAccess: "e2e-interview-access-0001",
    completedAccess: "e2e-interview-access-0002",
    goldenAccess: "e2e-interview-access-0003",
  },
  routes: {
    jobDetail: `/jobs/${ids.job}`,
    candidateDetail: `/candidates/${ids.candidate}`,
    interviewWelcome: `/interview/${ids.interviewWelcome}`,
    interviewGolden: `/interview/${ids.interviewGolden}`,
    acceptInvitation: `/interview/accept?token=e2e-invitation-token-0001`,
  },
} as const;

/** Where the `setup` Playwright project writes real-session storage state. */
export const STORAGE_STATE_PATHS = {
  recruiter: "e2e/.auth/recruiter.json",
  candidate: "e2e/.auth/candidate.json",
  admin: "e2e/.auth/admin.json",
} as const;

/** Dynamic-route fixtures for the logged-out route matrix and route-access spec. */
export const ROUTE_MATRIX_FIXTURES: Record<string, string> = {
  "/jobs/[id]": E2E_FIXTURES.routes.jobDetail,
  "/candidates/[id]": E2E_FIXTURES.routes.candidateDetail,
  "/interview/[id]": E2E_FIXTURES.routes.interviewWelcome,
};

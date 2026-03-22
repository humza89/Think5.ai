import { createSupabaseServerClient } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/types/supabase';

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Get the authenticated user from the current request's Supabase session.
 * Throws AuthError(401) if not authenticated.
 * Also checks account_status — suspended/deactivated users are blocked.
 */
export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError('Unauthorized', 401);
  }

  // Fetch profile from Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    throw new AuthError('Profile not found', 401);
  }

  // Enforce account status (deny-by-default for non-active accounts)
  const accountStatus = (profile as Record<string, unknown>).account_status as string | undefined;
  if (accountStatus === 'suspended') {
    throw new AuthError('Account suspended. Contact support.', 403);
  }
  if (accountStatus === 'deactivated') {
    throw new AuthError('Account deactivated.', 403);
  }

  return { user, profile };
}

/**
 * Require that the authenticated user has one of the specified roles.
 * Throws AuthError(403) if the user's role is not in allowedRoles.
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const { user, profile } = await getAuthenticatedUser();

  if (!profile || !allowedRoles.includes(profile.role)) {
    throw new AuthError('Forbidden: insufficient permissions', 403);
  }

  return { user, profile };
}

/**
 * Require that the authenticated user is a candidate with role check.
 * Returns the Prisma Candidate record linked to this user.
 */
export async function requireCandidateRole() {
  const { user, profile } = await requireRole(['candidate']);

  const candidate = await prisma.candidate.findFirst({
    where: { email: profile.email },
  });

  if (!candidate) {
    throw new AuthError('Candidate record not found', 404);
  }

  return { user, profile, candidate };
}

/**
 * Require that the authenticated user has completed onboarding AND been approved.
 * - Candidates: onboardingStatus must be "APPROVED"
 * - Recruiters: onboardingCompleted must be true
 * - Admins/hiring_managers: no onboarding gate
 */
export async function requireApprovedAccess(allowedRoles: UserRole[]) {
  const { user, profile } = await requireRole(allowedRoles);

  if (profile.role === 'candidate') {
    const candidate = await prisma.candidate.findFirst({
      where: { email: profile.email },
      select: { onboardingCompleted: true, onboardingStatus: true },
    });

    if (!candidate) {
      throw new AuthError('Candidate record not found', 404);
    }

    if (!candidate.onboardingCompleted || candidate.onboardingStatus !== 'APPROVED') {
      throw new AuthError('Account not yet approved. Complete onboarding and await admin approval.', 403);
    }
  }

  if (profile.role === 'recruiter') {
    const recruiter = await prisma.recruiter.findFirst({
      where: { supabaseUserId: user.id },
      select: { onboardingCompleted: true, onboardingStatus: true },
    });

    if (recruiter && !recruiter.onboardingCompleted) {
      throw new AuthError('Please complete onboarding first.', 403);
    }
    if (recruiter && recruiter.onboardingStatus !== 'APPROVED' && recruiter.onboardingStatus !== 'COMPLETED') {
      throw new AuthError('Account not yet approved. Await admin approval.', 403);
    }
  }

  return { user, profile };
}

/**
 * Get or create the Prisma Recruiter record linked to the authenticated Supabase user.
 * Links via supabaseUserId (primary) or email (fallback for existing records).
 */
export async function getRecruiterForUser(supabaseUserId: string, email: string, name: string) {
  // Try by supabaseUserId first
  let recruiter = await prisma.recruiter.findUnique({
    where: { supabaseUserId },
  });

  if (recruiter) return recruiter;

  // Fallback: try matching by email (backfill scenario)
  recruiter = await prisma.recruiter.findUnique({
    where: { email },
  });

  if (recruiter) {
    // Backfill the supabaseUserId
    recruiter = await prisma.recruiter.update({
      where: { id: recruiter.id },
      data: { supabaseUserId },
    });
    return recruiter;
  }

  // Don't auto-create recruiters without company association — require explicit onboarding
  throw new AuthError('Recruiter account not found. Please complete registration first.', 404);
}

/**
 * Require that the authenticated user is a recruiter.
 * Returns the Prisma Recruiter record and the recruiter's companyId (tenant).
 * companyId may be null for recruiters not yet associated with a company.
 */
export async function requireRecruiterRole() {
  const { user, profile } = await requireRole(['recruiter']);

  const recruiter = await getRecruiterForUser(
    user.id,
    profile.email,
    `${profile.first_name} ${profile.last_name}`
  );

  return { user, profile, recruiter, companyId: recruiter.companyId ?? null };
}

/**
 * Verify that the authenticated user owns the candidate (via recruiterId).
 * Admins bypass ownership checks.
 */
export async function requireCandidateAccess(candidateId: string) {
  const { user, profile } = await getAuthenticatedUser();

  if (!profile) {
    throw new AuthError('Profile not found', 403);
  }

  // Admins can access any candidate
  if (profile.role === 'admin') {
    return { user, profile, recruiter: null };
  }

  // Recruiters can only access their own candidates
  if (profile.role === 'recruiter') {
    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { recruiterId: true },
    });

    if (!candidate) {
      throw new AuthError('Candidate not found', 404);
    }

    if (candidate.recruiterId !== recruiter.id) {
      throw new AuthError('Forbidden: you do not own this candidate', 403);
    }

    return { user, profile, recruiter };
  }

  throw new AuthError('Forbidden: insufficient permissions', 403);
}

/**
 * Verify that the authenticated user has access to a specific interview.
 * Admins can access any interview.
 * Recruiters must have scheduled it or own the candidate.
 * Hiring managers can access interviews within their company scope.
 */
export async function requireInterviewAccess(interviewId: string) {
  const { user, profile } = await getAuthenticatedUser();

  if (!profile || !['recruiter', 'admin', 'hiring_manager'].includes(profile.role)) {
    throw new AuthError('Forbidden: insufficient permissions', 403);
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { scheduledBy: true, candidateId: true, companyId: true },
  });

  if (!interview) {
    throw new AuthError('Interview not found', 404);
  }

  if (profile.role === 'admin') {
    return { user, profile, interview };
  }

  // Hiring managers: company-scoped access via scheduling recruiter's company
  if (profile.role === 'hiring_manager') {
    if (!interview.companyId) {
      throw new AuthError('Forbidden: this interview has no company association', 403);
    }
    // Find the scheduling recruiter's company and check if the HM's email
    // matches any recruiter in the same company (team membership proxy)
    const schedulingRecruiter = await prisma.recruiter.findUnique({
      where: { id: interview.scheduledBy },
      select: { companyId: true },
    });
    if (!schedulingRecruiter || schedulingRecruiter.companyId !== interview.companyId) {
      throw new AuthError('Forbidden: you do not have access to this interview', 403);
    }
    // Check HM belongs to same company: look up company's domain or match HM email domain
    const companyRecruiters = await prisma.recruiter.findMany({
      where: { companyId: interview.companyId },
      select: { email: true },
    });
    // Extract email domains from company recruiters
    const companyDomains = new Set(
      companyRecruiters.map((r: { email: string }) => r.email.split('@')[1]?.toLowerCase()).filter(Boolean)
    );
    const hmDomain = profile.email.split('@')[1]?.toLowerCase();
    if (!hmDomain || !companyDomains.has(hmDomain)) {
      throw new AuthError('Forbidden: you do not have access to this interview', 403);
    }
    return { user, profile, interview };
  }

  // Recruiters: must have scheduled or own the candidate
  const recruiter = await getRecruiterForUser(
    user.id,
    profile.email,
    `${profile.first_name} ${profile.last_name}`
  );

  if (interview.scheduledBy !== recruiter.id) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: interview.candidateId },
      select: { recruiterId: true },
    });

    if (!candidate || candidate.recruiterId !== recruiter.id) {
      throw new AuthError('Forbidden: you do not have access to this interview', 403);
    }
  }

  return { user, profile, interview };
}

/**
 * Helper to handle AuthError in API route handlers.
 */
export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return { error: error.message, status: error.statusCode };
  }
  // Log full error to Sentry but return generic message to client
  try {
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error);
  } catch {
    // Sentry not available
  }
  console.error("Internal server error:", error);
  return { error: "Internal server error", status: 500 };
}

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/types/supabase';
import { logger } from "@/lib/logger";

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    /** Machine-readable reason, e.g. MFA_REQUIRED (T9). */
    public code?: string
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

  return { user, profile, supabase };
}

/**
 * T9: reject an aal1 session where the MFA policy requires aal2. Enforcement
 * is behind FF_P0_MFA_ENFORCEMENT; the assurance level is read from the
 * session JWT (no network call).
 */
export async function enforceMfa(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profile: { id: string; email: string; role: UserRole },
): Promise<void> {
  const { mfaEnforcementEnabled, resolveMfaPolicy, prismaMfaLookup, mfaVerdict } = await import('@/lib/mfa');
  if (!mfaEnforcementEnabled()) return;
  const policy = await resolveMfaPolicy(profile, prismaMfaLookup(prisma));
  if (!policy.required) return;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const verdict = mfaVerdict(policy, { currentLevel: data?.currentLevel ?? null, nextLevel: data?.nextLevel ?? null }, true);
  if (!verdict.ok) throw new AuthError(verdict.message, 403, verdict.code);
}

/**
 * Require that the authenticated user has one of the specified roles.
 * Throws AuthError(403) if the user's role is not in allowedRoles, or (T9)
 * AuthError(403, MFA_REQUIRED | MFA_ENROLLMENT_REQUIRED) when the MFA policy
 * for the role is not satisfied by this session.
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const { user, profile, supabase } = await getAuthenticatedUser();

  if (!profile || !allowedRoles.includes(profile.role)) {
    throw new AuthError('Forbidden: insufficient permissions', 403);
  }

  await enforceMfa(supabase, profile as { id: string; email: string; role: UserRole });

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

    // SECURITY: Block auto-created recruiters that haven't completed onboarding
    if (!recruiter || !recruiter.onboardingCompleted) {
      throw new AuthError('Please complete onboarding first.', 403);
    }
    if (recruiter.onboardingStatus !== 'APPROVED' && recruiter.onboardingStatus !== 'COMPLETED') {
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

  // Auto-create recruiter for new signups (onboarding entry point)
  recruiter = await prisma.recruiter.create({
    data: {
      supabaseUserId,
      email,
      name,
      onboardingStep: 0,
      onboardingCompleted: false,
      onboardingStatus: 'NOT_STARTED',
    },
  });
  return recruiter;
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
      // SECURITY: Do not auto-claim candidates. Requires explicit admin assignment.
      // Previously auto-claimed system-owned candidates, which broke tenant isolation.
      throw new AuthError('Forbidden: you do not own this candidate', 403);
    }

    return { user, profile, recruiter };
  }

  throw new AuthError('Forbidden: insufficient permissions', 403);
}

/**
 * Prisma `where` fragment that enforces tenant isolation for the authenticated
 * user against the Interview table. Build one with `buildInterviewAccessScope()`
 * and pass it straight into a `findFirst` / `updateMany` so the database query
 * itself refuses to return or touch cross-tenant rows.
 *
 * Salvaged from legacy PRs #4 / #6 (see docs/phase0/legacy-pr-audit.md): the
 * older pattern was a two-query dance — `requireInterviewAccess()` ran the auth
 * check, then the caller ran a SECOND unscoped `findUnique({ where: { id } })`
 * to fetch data. A bug in the auth logic or a future refactor could let
 * cross-tenant data leak. This contract keeps auth and data in ONE scoped query.
 */
export interface InterviewAccessScope {
  interviewId: string;
  /**
   * Prisma `where` fragment to merge into the caller's query. Always includes
   * the interview id plus a tenant filter appropriate to the user's role
   * (admins get no tenant filter — see isAdmin).
   */
  whereFragment: Record<string, unknown>;
  /** True if the caller is an admin (global access — no tenant filter). */
  isAdmin: boolean;
  /** The authenticated user's role, for audit logging. */
  role: string;
  /** The authenticated user's id, for audit logging. */
  userId: string;
}

/**
 * Build a tenant-scoped Prisma `where` fragment for the authenticated user.
 * Throws AuthError(401) when unauthenticated and AuthError(404) for every
 * other failure — wrong role, no active hiring-manager membership — so the
 * response shape never reveals whether an interview id exists.
 *
 * Callers MUST use the returned whereFragment in their Prisma query and MUST
 * NOT bypass it with a direct `findUnique({ where: { id } })`.
 * `__tests__/lib/tenant-scope-sweep.test.ts` enforces this at source level.
 */
export async function buildInterviewAccessScope(
  interviewId: string,
): Promise<InterviewAccessScope> {
  const { user, profile } = await getAuthenticatedUser();

  if (!profile || !['recruiter', 'admin', 'hiring_manager'].includes(profile.role)) {
    // Same error shape as "not found" on purpose — never leak role info.
    throw new AuthError('Interview not found', 404);
  }

  // Admins: no tenant filter, full access by design.
  if (profile.role === 'admin') {
    return {
      interviewId,
      whereFragment: { id: interviewId },
      isAdmin: true,
      role: 'admin',
      userId: user.id,
    };
  }

  // Hiring managers: scope by company via explicit, active, unexpired membership.
  if (profile.role === 'hiring_manager') {
    const memberships = await prisma.hiringManagerMembership.findMany({
      where: {
        userId: user.id,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { companyId: true },
    });
    const companyIds = memberships.map((m: { companyId: string }) => m.companyId);
    if (companyIds.length === 0) {
      throw new AuthError('Interview not found', 404);
    }
    return {
      interviewId,
      whereFragment: { id: interviewId, companyId: { in: companyIds } },
      isAdmin: false,
      role: 'hiring_manager',
      userId: user.id,
    };
  }

  // Recruiters: scheduled the interview OR own the candidate, resolved the
  // same way requireInterviewAccess does.
  const recruiter = await getRecruiterForUser(
    user.id,
    profile.email,
    `${profile.first_name} ${profile.last_name}`,
  );

  return {
    interviewId,
    whereFragment: {
      id: interviewId,
      OR: [
        { scheduledBy: recruiter.id },
        { candidate: { recruiterId: recruiter.id } },
      ],
      // Defence in depth: a recruiter attached to a company may only reach
      // interviews of that company.
      ...(recruiter.companyId ? { companyId: recruiter.companyId } : {}),
    },
    isAdmin: false,
    role: 'recruiter',
    userId: user.id,
  };
}

/**
 * Verify that the authenticated user has access to a specific interview.
 * Admins can access any interview.
 * Recruiters must have scheduled it or own the candidate.
 * Hiring managers can access interviews within their company scope.
 *
 * Note: this runs an unscoped lookup and then checks the result, so callers
 * need a second query for their data. Routes that read interview data should
 * prefer `buildInterviewAccessScope()` and a single scoped query.
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

  // Hiring managers: company-scoped access via explicit membership
  if (profile.role === 'hiring_manager') {
    if (!interview.companyId) {
      throw new AuthError('Forbidden: this interview has no company association', 403);
    }
    // Check for explicit HM membership record (replaces email domain matching)
    const membership = await prisma.hiringManagerMembership.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: interview.companyId,
        },
      },
    });
    if (!membership || !membership.isActive) {
      throw new AuthError('Forbidden: you do not have access to this company\'s interviews. Contact your admin to request access.', 403);
    }
    // Check membership expiry
    if (membership.expiresAt && new Date() > membership.expiresAt) {
      throw new AuthError('Forbidden: your hiring manager access has expired. Contact your admin to renew.', 403);
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
    return error.code ? { error: error.message, status: error.statusCode, code: error.code } : { error: error.message, status: error.statusCode };
  }
  // Log full error to Sentry but return generic message to client
  try {
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error);
  } catch {
    // Sentry not available
  }
  logger.error("Internal server error", { error });
  return { error: "Internal server error", status: 500 };
}

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

  // Create new recruiter
  recruiter = await prisma.recruiter.create({
    data: {
      name,
      email,
      supabaseUserId,
    },
  });

  return recruiter;
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
 * Helper to handle AuthError in API route handlers.
 */
export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return { error: error.message, status: error.statusCode };
  }
  return { error: 'Internal server error', status: 500 };
}

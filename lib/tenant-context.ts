import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, getRecruiterForUser, AuthError } from '@/lib/auth';

/**
 * Resolve the tenant (company) ID for a given Supabase user.
 * Looks up the user's Recruiter record and returns their companyId.
 * Returns null if the user has no company association (backwards compatible).
 */
export async function resolveTenantId(userId: string): Promise<string | null> {
  const recruiter = await prisma.recruiter.findUnique({
    where: { supabaseUserId: userId },
    select: { companyId: true },
  });

  return recruiter?.companyId ?? null;
}

/**
 * Add a companyId filter to a Prisma where clause.
 * If tenantId is null, returns the query unmodified (backwards compatible).
 */
export function scopeQuery<T extends Record<string, any>>(query: T, tenantId: string | null): T {
  if (!tenantId) {
    return query;
  }

  return {
    ...query,
    companyId: tenantId,
  };
}

/**
 * Combine authentication + tenant resolution.
 * Returns the authenticated user, profile, and resolved tenantId.
 * Throws AuthError if the user is not authenticated.
 * Note: tenantId may be null for users not yet associated with a company.
 */
export async function requireTenant(): Promise<{
  tenantId: string;
  user: any;
  profile: any;
}> {
  const { user, profile } = await getAuthenticatedUser();

  const tenantId = await resolveTenantId(user.id);

  if (!tenantId) {
    throw new AuthError('No company association found. Contact your administrator.', 403);
  }

  return { tenantId, user, profile };
}

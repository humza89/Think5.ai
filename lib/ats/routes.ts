/** Shared helpers for /api/integrations/[provider]/* (Phase 0 T15). */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireRecruiterRole } from "@/lib/auth";

export const SUPPORTED_PROVIDERS = ["greenhouse"] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function providerOr501(provider: string): SupportedProvider | NextResponse {
  if ((SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) return provider as SupportedProvider;
  return NextResponse.json({ error: `Provider "${provider}" is not available in Phase 0 (Greenhouse only)` }, { status: 501 });
}

/** Recruiter with a company; admins may pass ?companyId=. */
export async function tenantContext(): Promise<{ companyId: string; recruiterId: string }> {
  const { recruiter, companyId } = await requireRecruiterRole();
  if (!companyId) throw new AuthError("Join a company before connecting an ATS", 409);
  return { companyId, recruiterId: recruiter.id };
}

export async function integrationFor(companyId: string, provider: SupportedProvider) {
  return prisma.aTSIntegration.findUnique({ where: { companyId_provider: { companyId, provider } } });
}

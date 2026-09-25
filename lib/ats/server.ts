/** Production wiring for the ATS sync engine (Prisma + usage meter). */
import { prisma } from "@/lib/prisma";
import { defaultAdapterFor, type SyncDb, type SyncDeps } from "@/lib/ats/sync";

export async function syncDeps(): Promise<SyncDeps> {
  const { recordUsage } = await import("@/lib/usage/meter");
  return {
    db: prisma as unknown as SyncDb,
    adapterFor: defaultAdapterFor,
    recordUsage: (input) => recordUsage(input),
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/** Enabled integrations for a tenant (used by event hooks). */
export async function integrationsForCompany(companyId: string, provider = "greenhouse"): Promise<Array<{ id: string }>> {
  return prisma.aTSIntegration.findMany({ where: { companyId, provider, enabled: true }, select: { id: true } });
}

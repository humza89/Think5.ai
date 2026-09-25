import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError } from "@/lib/auth";
import { integrationFor, providerOr501, tenantContext } from "@/lib/ats/routes";

/** GET /api/integrations/[provider]/status — connection, last sync, recent runs, link counts (T15). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration) return NextResponse.json({ connected: false, provider });
    const [runs, linkGroups] = await Promise.all([
      prisma.aTSSyncRun.findMany({ where: { integrationId: integration.id }, orderBy: { startedAt: "desc" }, take: 10 }),
      prisma.aTSEntityLink.groupBy({ by: ["localType"], where: { integrationId: integration.id }, _count: { _all: true } }),
    ]);
    const cfg = (integration.config ?? {}) as { onBehalfOf?: string | null };
    return NextResponse.json({
      connected: integration.enabled,
      provider,
      integrationId: integration.id,
      lastSyncAt: integration.lastSyncAt,
      syncStatus: integration.syncStatus,
      syncError: integration.syncError,
      webhookConfigured: Boolean(integration.webhookSecret),
      onBehalfOf: cfg.onBehalfOf ?? null,
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/integrations/greenhouse/webhook?integration=${integration.id}`,
      runs,
      links: Object.fromEntries((linkGroups as Array<{ localType: string; _count: { _all: number } }>).map((g) => [g.localType, g._count._all])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { GreenhouseAdapter } from "@/lib/ats/adapters/greenhouse";
import { integrationFor, providerOr501, tenantContext } from "@/lib/ats/routes";

/**
 * POST /api/integrations/[provider]/connect { apiKey, webhookSecret?, onBehalfOf? } (T15 Step 1)
 * Verifies the Harvest key with the adapter, stores it encrypted (AES-GCM,
 * lib/ats/encryption.ts) and enables the integration. DELETE disconnects.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId, recruiterId } = await tenantContext();
    if (!process.env.ATS_ENCRYPTION_KEY) {
      return NextResponse.json({ error: "ATS_ENCRYPTION_KEY is not configured; credentials cannot be stored", code: "ATS_ENCRYPTION_UNCONFIGURED" }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const webhookSecret = typeof body.webhookSecret === "string" && body.webhookSecret.trim() ? body.webhookSecret.trim() : null;
    const onBehalfOf = typeof body.onBehalfOf === "string" && body.onBehalfOf.trim() ? body.onBehalfOf.trim() : undefined;
    if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

    const adapter = new GreenhouseAdapter({ onBehalfOf });
    const connection = await adapter.connect({ provider: "greenhouse", tenantId: companyId, apiKey, webhookSecret: webhookSecret ?? undefined });
    if (!connection.connected) {
      return NextResponse.json({ error: "Greenhouse rejected the API key", detail: connection.detail }, { status: 422 });
    }
    const { encryptATSKey } = await import("@/lib/ats/encryption");
    const integration = await prisma.aTSIntegration.upsert({
      where: { companyId_provider: { companyId, provider } },
      create: { companyId, provider, apiKey: encryptATSKey(apiKey), webhookSecret, enabled: true, syncStatus: "idle", config: { onBehalfOf: onBehalfOf ?? null, connectedByRecruiterId: recruiterId } },
      update: { apiKey: encryptATSKey(apiKey), webhookSecret, enabled: true, syncStatus: "idle", syncError: null, config: { onBehalfOf: onBehalfOf ?? null, connectedByRecruiterId: recruiterId } },
    });
    await logActivity({ userId: recruiterId, userRole: "recruiter", action: "ats.connected", entityType: "ATSIntegration", entityId: integration.id, metadata: { provider, companyId } }).catch(() => {});
    return NextResponse.json({ id: integration.id, provider, connected: true, accountName: connection.accountName, webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/integrations/greenhouse/webhook?integration=${integration.id}` }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId, recruiterId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });
    await prisma.aTSIntegration.update({ where: { id: integration.id }, data: { enabled: false, syncStatus: "idle", syncError: null } });
    await logActivity({ userId: recruiterId, userRole: "recruiter", action: "ats.disconnected", entityType: "ATSIntegration", entityId: integration.id, metadata: { provider } }).catch(() => {});
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

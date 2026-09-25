import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError } from "@/lib/auth";
import { integrationFor, providerOr501, tenantContext } from "@/lib/ats/routes";

/**
 * Reconciliation (T15 Step 6).
 * GET → links with local vs remote state and a mismatch verdict.
 * POST { linkId, action: "retry" } → re-run the push/import for that link (queued).
 * DELETE { linkId } → unlink (the local record stays; the remote is untouched).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration) return NextResponse.json({ links: [] });
    const { syncDeps } = await import("@/lib/ats/server");
    const { reconciliation } = await import("@/lib/ats/sync");
    return NextResponse.json({ links: await reconciliation(await syncDeps(), integration.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const link = typeof body.linkId === "string" ? await prisma.aTSEntityLink.findUnique({ where: { id: body.linkId } }) : null;
    if (!link || link.integrationId !== integration.id) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    const { inngest } = await import("@/inngest/client");
    if (link.localType === "job") await inngest.send({ name: "ats/sync.requested", data: { integrationId: integration.id, direction: "import", trigger: "retry" } });
    else if (link.localType === "application") await inngest.send({ name: "ats/sync.requested", data: { integrationId: integration.id, direction: "export", applicationId: link.localId, trigger: "retry" } });
    else if (link.localType === "report") await inngest.send({ name: "ats/sync.requested", data: { integrationId: integration.id, direction: "export", interviewId: link.localId, trigger: "retry" } });
    else return NextResponse.json({ error: `Retry is not applicable to ${link.localType}` }, { status: 400 });
    await prisma.aTSEntityLink.update({ where: { id: link.id }, data: { lastError: null } });
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const link = typeof body.linkId === "string" ? await prisma.aTSEntityLink.findUnique({ where: { id: body.linkId } }) : null;
    if (!link || link.integrationId !== integration.id) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    await prisma.aTSEntityLink.delete({ where: { id: link.id } });
    return NextResponse.json({ unlinked: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

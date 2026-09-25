import { NextRequest, NextResponse } from "next/server";
import { handleAuthError } from "@/lib/auth";
import { integrationFor, providerOr501, tenantContext } from "@/lib/ats/routes";

/**
 * POST /api/integrations/[provider]/sync { direction?: "import" | "export", applicationId?, interviewId?, inline?: boolean } (T15)
 * Queues a durable sync (Inngest). `inline: true` runs it in-request for
 * operators without a worker (bounded by the request timeout).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = providerOr501((await params).provider);
    if (provider instanceof NextResponse) return provider;
    const { companyId } = await tenantContext();
    const integration = await integrationFor(companyId, provider);
    if (!integration || !integration.enabled) return NextResponse.json({ error: "Not connected" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const direction = body.direction === "export" ? "export" : "import";
    const data = { integrationId: integration.id, direction, applicationId: typeof body.applicationId === "string" ? body.applicationId : undefined, interviewId: typeof body.interviewId === "string" ? body.interviewId : undefined, trigger: "manual" };
    if (body.inline === true) {
      const { syncDeps } = await import("@/lib/ats/server");
      const { importJobs, pushApplication, pushReport } = await import("@/lib/ats/sync");
      const deps = await syncDeps();
      const outcome = direction === "import"
        ? await importJobs(deps, integration.id, "manual")
        : data.applicationId
          ? await pushApplication(deps, integration.id, data.applicationId, "manual")
          : data.interviewId
            ? await pushReport(deps, integration.id, data.interviewId, "manual")
            : null;
      if (!outcome) return NextResponse.json({ error: "export requires applicationId or interviewId" }, { status: 400 });
      return NextResponse.json({ runId: outcome.run.id, status: outcome.run.status, counts: outcome.counts, errors: outcome.errors });
    }
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name: "ats/sync.requested", data });
    return NextResponse.json({ queued: true, direction }, { status: 202 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Durable ATS sync (Phase 0 T15).
 *
 * Event-driven: `ats/sync.requested` { integrationId, direction, applicationId?, interviewId?, trigger? }.
 * Scheduled: every 6 hours import open jobs for every enabled Greenhouse integration.
 * Concurrency is keyed per integration so two runs never interleave writes to
 * the same tenant's links; every step is idempotent through ATSEntityLink keys.
 */
import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const atsSync = inngest.createFunction(
  {
    id: "ats/sync",
    retries: 3,
    concurrency: [{ key: "event.data.integrationId", limit: 1 }],
    triggers: [{ event: "ats/sync.requested" }],
  },
  async ({ event, step }: any) => {
    const { integrationId, direction, applicationId, interviewId, trigger } = event.data as {
      integrationId: string;
      direction: "import" | "export";
      applicationId?: string;
      interviewId?: string;
      trigger?: string;
    };
    const result = await step.run(`sync-${direction}`, async () => {
      const { syncDeps } = await import("@/lib/ats/server");
      const { importJobs, pushApplication, pushReport } = await import("@/lib/ats/sync");
      const deps = await syncDeps();
      if (direction === "import") return summarise(await importJobs(deps, integrationId, trigger ?? "event"));
      if (applicationId) return summarise(await pushApplication(deps, integrationId, applicationId, trigger ?? "event"));
      if (interviewId) return summarise(await pushReport(deps, integrationId, interviewId, trigger ?? "event"));
      throw new Error("export requires applicationId or interviewId");
    });
    return { integrationId, direction, ...result };
  }
);

export const atsScheduledImport = inngest.createFunction(
  { id: "ats/scheduled-import", retries: 1, triggers: [{ cron: "0 */6 * * *" }] },
  async ({ step }: any) => {
    const integrations = await step.run("list-integrations", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.aTSIntegration.findMany({ where: { enabled: true, provider: "greenhouse" }, select: { id: true } }) as Promise<Array<{ id: string }>>;
    });
    if (integrations.length > 0) {
      await step.sendEvent(
        "fan-out-imports",
        integrations.map((i: { id: string }) => ({ name: "ats/sync.requested", data: { integrationId: i.id, direction: "import", trigger: "schedule" } })),
      );
    }
    return { scheduled: integrations.length };
  }
);

function summarise(outcome: { run: { id: string; status: string }; counts: unknown; errors: unknown[] }) {
  return { runId: outcome.run.id, status: outcome.run.status, counts: outcome.counts, errors: outcome.errors.length };
}

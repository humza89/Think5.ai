/**
 * Durable Job: Interview Report Generation
 *
 * Triggered when an interview completes. Generates the full report
 * with built-in retries, dead-letter handling, and step-based
 * execution for observability.
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const reportGenerate = inngest.createFunction(
  {
    id: "interview/report.generate",
    retries: 5,
    triggers: [{ event: "interview/completed" }],
    onFailure: async ({ error }: any) => {
      console.error(
        `[DEAD LETTER] Report generation permanently failed:`,
        error?.message
      );
    },
  },
  async ({ event, step }: any) => {
    const { interviewId } = event.data;

    // Step 1: Generate the report (with SLO tracking)
    await step.run("generate-report", async () => {
      const { generateReportInBackground } = await import(
        "@/lib/report-generator"
      );
      const { recordSLOEvent } = await import("@/lib/slo-monitor");
      const start = Date.now();
      try {
        await generateReportInBackground(interviewId);
        const durationMs = Date.now() - start;
        await recordSLOEvent("report.generation.time_p95", durationMs <= 120000, durationMs);
      } catch (err) {
        const durationMs = Date.now() - start;
        await recordSLOEvent("report.generation.time_p95", false, durationMs);
        throw err;
      }
      return { interviewId };
    });

    // Step 2: Validate section coverage against planned objectives
    await step.run("validate-section-coverage", async () => {
      const { validateSectionCoverage } = await import(
        "@/lib/section-coverage"
      );
      await validateSectionCoverage(interviewId);
    });

    // Step 3: Compile evidence bundle
    await step.run("compile-evidence-bundle", async () => {
      const { compileEvidenceBundle } = await import(
        "@/lib/evidence-bundle-compiler"
      );
      await compileEvidenceBundle(interviewId);
    });

    // Step 4: Compute quality metrics
    await step.run("compute-quality-metrics", async () => {
      const { computeQualityMetrics } = await import(
        "@/lib/quality-metrics"
      );
      await computeQualityMetrics(interviewId);
    });

    // Step 5: Send notification emails
    await step.run("send-notifications", async () => {
      const { sendInterviewNotifications } = await import(
        "@/lib/interview-notifications"
      );
      await sendInterviewNotifications(interviewId);
    });

    // Step 6: Create in-app notifications
    await step.run("create-in-app-notifications", async () => {
      const { notifyReportReady } = await import("@/lib/realtime-notify");
      await notifyReportReady(interviewId);
    });

    // Step 7: Dispatch webhooks to external systems
    await step.run("dispatch-webhooks", async () => {
      const { dispatchWebhooks } = await import("@/lib/webhook-dispatch");
      const { prisma } = await import("@/lib/prisma");
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { companyId: true, candidateId: true },
      });
      if (interview?.companyId) {
        await dispatchWebhooks("report.ready", interview.companyId, {
          interviewId,
          candidateId: interview.candidateId,
        });
      }
    });

    return { interviewId, status: "complete" };
  }
);

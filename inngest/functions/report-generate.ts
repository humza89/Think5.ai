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

    // Step 1: Generate the report
    await step.run("generate-report", async () => {
      const { generateReportInBackground } = await import(
        "@/lib/report-generator"
      );
      await generateReportInBackground(interviewId);
      return { interviewId };
    });

    // Step 2: Compile evidence bundle (after report succeeds)
    await step.run("compile-evidence-bundle", async () => {
      const { compileEvidenceBundle } = await import(
        "@/lib/evidence-bundle-compiler"
      );
      await compileEvidenceBundle(interviewId);
    });

    // Step 3: Compute quality metrics
    await step.run("compute-quality-metrics", async () => {
      const { computeQualityMetrics } = await import(
        "@/lib/quality-metrics"
      );
      await computeQualityMetrics(interviewId);
    });

    // Step 4: Send notification emails
    await step.run("send-notifications", async () => {
      const { sendInterviewNotifications } = await import(
        "@/lib/interview-notifications"
      );
      await sendInterviewNotifications(interviewId);
    });

    return { interviewId, status: "complete" };
  }
);

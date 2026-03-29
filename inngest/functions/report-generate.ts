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

    // F4: Pre-check — validate interview data before generating report
    await step.run("validate-interview-data", async () => {
      const { prisma } = await import("@/lib/prisma");
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { id: true, transcript: true, report: true, status: true, recruiterId: true },
      });

      if (!interview) {
        console.error(`[Report] Interview ${interviewId} not found`);
        throw new Error(`Interview ${interviewId} not found`);
      }

      if (interview.report) {
        console.log(`[Report] Interview ${interviewId} already has a report — skipping`);
        return { skip: true };
      }

      if (!interview.transcript || (Array.isArray(interview.transcript) && interview.transcript.length === 0)) {
        console.error(`[Report] Interview ${interviewId} has no transcript — cannot generate report`);
        // Update status to REPORT_FAILED
        await prisma.interview.update({
          where: { id: interviewId },
          data: { reportStatus: "failed" },
        });
        // Create notification for recruiter
        if (interview.recruiterId) {
          await prisma.notification.create({
            data: {
              userId: interview.recruiterId,
              type: "REPORT_FAILED",
              title: "Report generation failed",
              message: `Report for interview ${interviewId} could not be generated — incomplete interview data (no transcript).`,
              interviewId,
            },
          }).catch((err: Error) => console.warn("[Report] Failed to create notification:", err.message));
        }
        throw new Error(`Interview ${interviewId} has no transcript data`);
      }

      return { skip: false };
    });

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

    // Step 4b: Compute session confidence and stability metadata
    // C4/R5: Cross-validate with proctoring events when session state has expired
    await step.run("compute-session-confidence", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { getSessionState } = await import("@/lib/session-store");

      const session = await getSessionState(interviewId);
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { transcript: true, integrityEvents: true, report: { select: { id: true } } },
      });

      if (!interview?.report) return;

      const transcriptLength = Array.isArray(interview.transcript) ? interview.transcript.length : 0;
      let reconnectCount = session?.reconnectCount ?? 0;
      let sessionStateExpired = false;

      // C4/R5: If session state expired (null), infer instability from proctoring events
      if (!session) {
        sessionStateExpired = true;
        const events = Array.isArray(interview.integrityEvents) ? interview.integrityEvents as Array<{ eventType?: string }> : [];
        const focusLostCount = events.filter(e => e.eventType === "focus_lost" || e.eventType === "tab_hidden").length;
        if (focusLostCount > 0) {
          // Infer at least 1 reconnect from focus loss events
          reconnectCount = Math.max(reconnectCount, Math.ceil(focusLostCount / 2));
        }
      }

      let sessionConfidence: "high" | "medium" | "low" = "high";
      if (reconnectCount >= 3 || transcriptLength < 6) {
        sessionConfidence = "low";
      } else if (reconnectCount >= 1 || transcriptLength < 12 || sessionStateExpired) {
        // C4/R5: Expired session state → medium at best (can't verify stability)
        sessionConfidence = "medium";
      }

      const stabilityMetadata = {
        reconnects: reconnectCount,
        transcriptTurns: transcriptLength,
        sessionConfidence,
        sessionStateExpired, // C4/R5: Flag when confidence was inferred from proctoring events
      };

      await prisma.interviewReport.update({
        where: { id: interview.report.id },
        data: {
          sessionConfidence,
          sessionStabilityMetadata: stabilityMetadata,
        },
      });

      console.log(`[Report] Session confidence for ${interviewId}: ${sessionConfidence} (reconnects=${reconnectCount}, turns=${transcriptLength})`);
    });

    // Step 4c: Apply governance policy (auto-review thresholds)
    await step.run("apply-governance-policy", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { getGovernancePolicy, shouldRequireReview } = await import("@/lib/governance");

      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { companyId: true, report: { select: { id: true, overallScore: true, reviewStatus: true } } },
      });

      if (interview?.companyId && interview.report) {
        const policy = await getGovernancePolicy(interview.companyId);
        if (shouldRequireReview(policy, interview.report.overallScore)) {
          await prisma.interviewReport.update({
            where: { id: interview.report.id },
            data: { reviewStatus: "PENDING_REVIEW" },
          });
        }
      }
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

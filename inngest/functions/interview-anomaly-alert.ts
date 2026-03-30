/**
 * Interview Anomaly Alert — Background anomaly detection from timeline events
 *
 * Triggered by: interview/anomaly.detected event
 * Reads InterviewEvent table for the interview and detects patterns:
 * - Repeated intros (>1 connect after first checkpoint)
 * - Grounding failures (score < 0.5)
 * - High reconnect count (>5 in a single interview)
 *
 * Logs structured warnings and records SLO events for alerting.
 */

import { inngest } from "@/inngest/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const interviewAnomalyAlert = inngest.createFunction(
  {
    id: "interview-anomaly-alert",
    name: "Interview Anomaly Alert",
    triggers: [{ event: "interview/anomaly.detected" }],
  },
  async ({ event, step }: any) => {
    const { interviewId } = event.data;

    if (!interviewId) {
      return { error: "Missing interviewId" };
    }

    // Step 1: Fetch timeline events for this interview
    const events = await step.run("fetch-timeline-events", async () => {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.interviewEvent.findMany({
        where: { interviewId },
        orderBy: { timestamp: "asc" },
      });
      return rows.map((r: any) => ({
        id: r.id,
        eventType: r.eventType,
        payload: r.payload,
        turnIndex: r.turnIndex,
        timestamp: r.timestamp,
      }));
    });

    if (events.length === 0) {
      return { interviewId, anomalies: 0, message: "No events found" };
    }

    // Step 2: Detect anomaly patterns
    const anomalies = await step.run("detect-anomalies", async () => {
      const detected: Array<{ type: string; severity: string; detail: string }> = [];

      // Pattern 1: Grounding failures
      const groundingFailures = events.filter(
        (e: any) => e.eventType === "grounding_failure"
      );
      if (groundingFailures.length > 0) {
        const avgScore = groundingFailures.reduce(
          (sum: number, e: any) => sum + (e.payload?.score || 0),
          0
        ) / groundingFailures.length;

        if (avgScore < 0.5) {
          detected.push({
            type: "low_grounding_score",
            severity: "high",
            detail: `${groundingFailures.length} grounding failure(s), avg score: ${avgScore.toFixed(2)}`,
          });
        }
      }

      // Pattern 2: Excessive reconnects
      const reconnects = events.filter((e: any) => e.eventType === "reconnect");
      if (reconnects.length > 5) {
        detected.push({
          type: "excessive_reconnects",
          severity: "medium",
          detail: `${reconnects.length} reconnects in single interview`,
        });
      }

      // Pattern 3: Repeated intros after first checkpoint
      const firstCheckpoint = events.find((e: any) => e.eventType === "checkpoint");
      if (firstCheckpoint) {
        const connectsAfterCheckpoint = events.filter(
          (e: any) =>
            e.eventType === "connect" &&
            new Date(e.timestamp) > new Date(firstCheckpoint.timestamp)
        );
        if (connectsAfterCheckpoint.length > 1) {
          detected.push({
            type: "repeated_intro_risk",
            severity: "medium",
            detail: `${connectsAfterCheckpoint.length} connect events after first checkpoint — intro suppression should be active`,
          });
        }
      }

      // Pattern 4: Long gaps between events (possible session stall)
      for (let i = 1; i < events.length; i++) {
        const gap = new Date(events[i].timestamp).getTime() - new Date(events[i - 1].timestamp).getTime();
        if (gap > 5 * 60 * 1000) { // >5 minute gap
          detected.push({
            type: "session_stall",
            severity: "low",
            detail: `${Math.round(gap / 60000)}min gap between ${events[i - 1].eventType} and ${events[i].eventType}`,
          });
          break; // Only flag first stall
        }
      }

      return detected;
    });

    // Step 3: Log and record SLO events for detected anomalies
    if (anomalies.length > 0) {
      await step.run("record-anomaly-slos", async () => {
        const { recordSLOEvent } = await import("@/lib/slo-monitor");
        const Sentry = await import("@sentry/nextjs");

        for (const anomaly of anomalies) {
          console.warn(
            `[anomaly-alert] Interview ${interviewId}: ${anomaly.type} (${anomaly.severity}) — ${anomaly.detail}`
          );

          // Record as SLO event
          await recordSLOEvent("transcript.anomaly.rate", false);

          // Alert via Sentry for high-severity anomalies
          if (anomaly.severity === "high") {
            Sentry.captureMessage(
              `Interview anomaly: ${anomaly.type} — ${anomaly.detail}`,
              {
                level: "warning",
                tags: { interviewId, anomalyType: anomaly.type },
              }
            );
          }
        }
      });
    }

    return {
      interviewId,
      totalEvents: events.length,
      anomalies: anomalies.length,
      detected: anomalies,
    };
  }
);

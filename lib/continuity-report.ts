/**
 * Continuity Report — Per-interview reliability analysis
 *
 * Aggregates timeline events, gate violations, and memory metrics
 * into a structured report with GREEN/YELLOW/RED grading.
 * Used for recruiter trust diagnostics and audit compliance.
 */

import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────

export type ContinuityGrade = "GREEN" | "YELLOW" | "RED";

export interface ContinuityIncident {
  timestamp: string;
  type: string;
  detail: string;
  severity: "critical" | "warning" | "info";
}

export interface ContinuityReport {
  interviewId: string;
  grade: ContinuityGrade;
  totalReconnects: number;
  memoryConfidence: {
    min: number;
    max: number;
    mean: number;
    breaches: number;
  };
  gateViolations: {
    outputGate: number;
    groundingGate: number;
    contradiction: number;
    hallucinatedRef: number;
  };
  contextResets: number;
  introSuppressions: number;
  hallucinationDetections: number;
  incidents: ContinuityIncident[];
  generatedAt: string;
}

// ── Report Generation ────────────────────────────────────────────────

/**
 * Generate a continuity report for a completed interview.
 * Aggregates data from InterviewEvent timeline.
 */
export async function generateContinuityReport(
  interviewId: string
): Promise<ContinuityReport> {
  // Fetch all timeline events for this interview
  const events = await prisma.interviewEvent.findMany({
    where: { interviewId },
    orderBy: { timestamp: "asc" },
  });

  const incidents: ContinuityIncident[] = [];
  let totalReconnects = 0;
  let contextResets = 0;
  let introSuppressions = 0;
  let hallucinationDetections = 0;
  let outputGateViolations = 0;
  let groundingGateViolations = 0;
  let contradictionViolations = 0;
  let hallucinatedRefViolations = 0;

  // Memory confidence tracking
  const confidenceValues: number[] = [];
  let confidenceBreaches = 0;

  for (const event of events) {
    const payload = event.payload as Record<string, unknown> | null;

    switch (event.eventType) {
      case "reconnect":
        totalReconnects++;
        incidents.push({
          timestamp: event.timestamp.toISOString(),
          type: "reconnect",
          detail: `Reconnect #${totalReconnects}`,
          severity: "info",
        });
        break;

      case "output_gate_blocked":
      case "output_gate_violation":
        outputGateViolations++;
        incidents.push({
          timestamp: event.timestamp.toISOString(),
          type: "output_gate",
          detail: `Output gate violation: ${payload?.reason || "unknown"}`,
          severity: "warning",
        });
        break;

      case "grounding_failure":
        groundingGateViolations++;
        hallucinationDetections++;
        incidents.push({
          timestamp: event.timestamp.toISOString(),
          type: "grounding_failure",
          detail: `Grounding gate failure: ${payload?.flag || "ungrounded"}`,
          severity: "critical",
        });
        break;

      case "contradiction_detected":
        contradictionViolations++;
        incidents.push({
          timestamp: event.timestamp.toISOString(),
          type: "contradiction",
          detail: `Contradiction: ${(payload?.contradictions as Array<{description: string}>)?.[0]?.description || "detected"}`,
          severity: "critical",
        });
        break;

      case "intro_suppressed":
        introSuppressions++;
        incidents.push({
          timestamp: event.timestamp.toISOString(),
          type: "intro_suppressed",
          detail: "Re-introduction attempt blocked",
          severity: "critical",
        });
        break;

      case "anomaly": {
        const anomalyType = payload?.type as string | undefined;
        if (anomalyType === "CONTEXT_RESET" || anomalyType === "context_reset") {
          contextResets++;
          incidents.push({
            timestamp: event.timestamp.toISOString(),
            type: "context_reset",
            detail: "Context reset detected",
            severity: "critical",
          });
        }
        if (anomalyType === "LOW_MEMORY_CONFIDENCE_ON_RECONNECT" || anomalyType === "RECONNECT_BLOCKED_LOW_MEMORY") {
          const confidence = payload?.confidence as number | undefined;
          if (confidence !== undefined) {
            confidenceValues.push(confidence);
            confidenceBreaches++;
          }
          incidents.push({
            timestamp: event.timestamp.toISOString(),
            type: "memory_confidence_low",
            detail: `Low memory confidence: ${confidence?.toFixed(2) ?? "unknown"}`,
            severity: "critical",
          });
        }
        if (anomalyType === "DEDUP_AUTHORITY_BREACH") {
          incidents.push({
            timestamp: event.timestamp.toISOString(),
            type: "dedup_breach",
            detail: `Dedup authority breach: ${payload?.divergenceCount ?? "unknown"} divergent questions`,
            severity: "warning",
          });
        }
        if (anomalyType === "HALLUCINATED_REFERENCE") {
          hallucinatedRefViolations++;
          hallucinationDetections++;
          incidents.push({
            timestamp: event.timestamp.toISOString(),
            type: "hallucinated_reference",
            detail: `Hallucinated reference detected`,
            severity: "critical",
          });
        }
        break;
      }

      case "memory_recovery_in_progress":
        if (typeof payload?.confidence === "number") {
          confidenceValues.push(payload.confidence as number);
        }
        break;

      case "memory_recovered":
        if (typeof payload?.recoveredConfidence === "number") {
          confidenceValues.push(payload.recoveredConfidence as number);
        }
        break;
    }
  }

  // Compute confidence stats
  const confidenceMin = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 1.0;
  const confidenceMax = confidenceValues.length > 0 ? Math.max(...confidenceValues) : 1.0;
  const confidenceMean = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 1.0;

  // Compute grade
  const totalGateViolations = outputGateViolations + groundingGateViolations + contradictionViolations + hallucinatedRefViolations;
  const grade = computeGrade({
    contextResets,
    hallucinationDetections,
    introSuppressions,
    totalGateViolations,
  });

  return {
    interviewId,
    grade,
    totalReconnects,
    memoryConfidence: {
      min: confidenceMin,
      max: confidenceMax,
      mean: confidenceMean,
      breaches: confidenceBreaches,
    },
    gateViolations: {
      outputGate: outputGateViolations,
      groundingGate: groundingGateViolations,
      contradiction: contradictionViolations,
      hallucinatedRef: hallucinatedRefViolations,
    },
    contextResets,
    introSuppressions,
    hallucinationDetections,
    incidents,
    generatedAt: new Date().toISOString(),
  };
}

// ── Grading ──────────────────────────────────────────────────────────

function computeGrade(params: {
  contextResets: number;
  hallucinationDetections: number;
  introSuppressions: number;
  totalGateViolations: number;
}): ContinuityGrade {
  // RED: Any context reset, hallucination, intro suppression, or >2 gate violations
  if (
    params.contextResets > 0 ||
    params.hallucinationDetections > 0 ||
    params.introSuppressions > 0 ||
    params.totalGateViolations > 2
  ) {
    return "RED";
  }

  // YELLOW: 1-2 gate violations
  if (params.totalGateViolations > 0) {
    return "YELLOW";
  }

  // GREEN: No incidents
  return "GREEN";
}

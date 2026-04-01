/**
 * Continuity SLO Scorecard — N12: Admin visibility into SLO metrics
 *
 * GET /api/admin/continuity-scorecard
 *
 * Returns current SLO status, rates, and breach information
 * for operational monitoring and audit compliance.
 */

import { getCurrentSLOStatus } from "@/lib/continuity-slo-monitor";

export async function GET() {
  try {
    const status = await getCurrentSLOStatus();

    const now = new Date();
    const periodStart = new Date(now.getTime() - status.windowMinutes * 60 * 1000);

    return Response.json({
      period: {
        start: periodStart.toISOString(),
        end: now.toISOString(),
      },
      sessionCount: status.sessionCount,
      resetRate: status.resetRate,
      repeatedIntroRate: status.repeatedIntroRate,
      hallucinationRate: status.hallucinationRate,
      memoryIntegrityBreakRate: status.memoryIntegrityBreakRate,
      sloStatus: status.isBreaching ? "BREACH" : "PASS",
      breachReason: status.breachReason,
      windowMinutes: status.windowMinutes,
    });
  } catch (err) {
    console.error("[continuity-scorecard] Failed to compute SLO status:", err);
    return Response.json({ error: "Failed to compute SLO status" }, { status: 500 });
  }
}

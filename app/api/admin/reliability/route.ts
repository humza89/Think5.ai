/**
 * Reliability Dashboard API
 *
 * Returns all SLO statuses with error budgets, failure taxonomy,
 * and weekly summary metrics for ops teams.
 */

import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { checkAllSLOs, SLO_DEFINITIONS } from "@/lib/slo-monitor";

export async function GET() {
  try {
    await requireRole(["admin"]);

    const sloStatuses = await checkAllSLOs();

    const breaches = sloStatuses.filter((s) => s.breached);
    const warnings = sloStatuses.filter(
      (s) => !s.breached && s.errorBudgetRemaining < 20
    );

    // Failure taxonomy: group by SLO name
    const failureTaxonomy = sloStatuses
      .filter((s) => s.totalEvents > 0)
      .map((s) => ({
        slo: s.name,
        description: s.description,
        totalEvents: s.totalEvents,
        failures: s.totalEvents - s.successEvents,
        failureRate: s.totalEvents > 0
          ? (((s.totalEvents - s.successEvents) / s.totalEvents) * 100).toFixed(2) + "%"
          : "0%",
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      windowHours: 24,
      totalSLOs: SLO_DEFINITIONS.length,
      summary: {
        healthy: sloStatuses.filter((s) => !s.breached && s.errorBudgetRemaining >= 20).length,
        warning: warnings.length,
        breached: breaches.length,
        noData: sloStatuses.filter((s) => s.totalEvents === 0).length,
      },
      slos: sloStatuses.map((s) => ({
        ...s,
        status: s.breached ? "breached" : s.errorBudgetRemaining < 20 ? "warning" : "healthy",
      })),
      breaches: breaches.map((s) => ({
        name: s.name,
        current: s.current,
        target: s.target,
        errorBudgetRemaining: s.errorBudgetRemaining,
      })),
      failureTaxonomy,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    if (status !== 500) {
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Reliability dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load reliability data" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { retryFailedReports, recoverStuckReports } from "@/lib/report-generator";

/**
 * Report Retry Cron — runs every 15 minutes
 *
 * Recovers stuck reports and retries failed report generation
 * with exponential backoff. Separate from the daily retention cron
 * to ensure faster recovery of failed reports.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const recovered = await recoverStuckReports();
    await retryFailedReports();

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      recovered: recovered.recovered,
    });
  } catch (error) {
    console.error("Report retry cron failed:", error);
    return NextResponse.json(
      { error: "Report retry cron failed" },
      { status: 500 }
    );
  }
}

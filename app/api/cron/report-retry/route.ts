import { NextRequest, NextResponse } from "next/server";
import { retryFailedReports, recoverStuckReports } from "@/lib/report-generator";

/**
 * Report Retry Cron — runs every 15 minutes
 *
 * Recovers stuck reports and retries failed report generation
 * with exponential backoff. Separate from the daily retention cron
 * to ensure faster recovery of failed reports.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

import { NextRequest, NextResponse } from "next/server";
import { applyRetentionPolicies } from "@/lib/data-retention";
import { retryFailedReports } from "@/lib/report-generator";

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized execution
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results: Record<string, unknown> = {};

    // Run retention cleanup
    try {
      const retentionResult = await applyRetentionPolicies();
      results.retention = retentionResult;
    } catch (err) {
      console.error("Retention cleanup failed:", err);
      results.retention = { error: "Failed" };
    }

    // Retry failed report generation
    try {
      const retryResult = await retryFailedReports();
      results.reportRetries = retryResult;
    } catch (err) {
      console.error("Report retry failed:", err);
      results.reportRetries = { error: "Failed" };
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Cron job failed:", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}

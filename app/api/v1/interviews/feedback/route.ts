import { NextResponse } from "next/server";

/**
 * DEPRECATED: This endpoint was a mock/placeholder.
 * Report generation is handled by the canonical POST /api/interviews/[id]/report endpoint
 * using lib/report-generator.ts with Gemini 1.5-pro.
 *
 * Returns 410 Gone to signal that this endpoint has been permanently removed.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed. Use POST /api/interviews/{id}/report for report generation.",
    },
    { status: 410 }
  );
}

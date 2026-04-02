/**
 * Continuity Report — Per-interview reliability analysis endpoint
 *
 * GET /api/interviews/:id/continuity-report
 *
 * Returns a structured continuity report with GREEN/YELLOW/RED grading.
 */

import { generateContinuityReport } from "@/lib/continuity-report";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify interview exists
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    const report = await generateContinuityReport(id);

    return Response.json(report, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error(`[continuity-report] Failed for interview=${id}:`, err);
    return Response.json({ error: "Failed to generate continuity report" }, { status: 500 });
  }
}

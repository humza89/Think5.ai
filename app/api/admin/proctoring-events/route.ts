import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Admin Proctoring Events API
 * Returns proctoring events with severity filtering and interview search.
 */
export async function GET(req: NextRequest) {
  // T5: admin-only. Returns 403 for every other role.
  try {
    await requireRole(["admin"]);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity");
  const interviewId = searchParams.get("interviewId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  try {
    const where: Record<string, unknown> = {};
    if (severity && severity !== "ALL") where.severity = severity;
    if (interviewId) where.interviewId = { contains: interviewId };

    const events = await prisma.proctoringEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    console.error("[Admin Proctoring Events] Error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

/**
 * Interview Timeline API — Replay-grade event retrieval
 *
 * GET: Returns the full event timeline for an interview.
 * Requires authenticated recruiter/admin access.
 */

import { NextRequest } from "next/server";
import { getTimeline, generateReplayReport } from "@/lib/interview-timeline";
import type { EventType } from "@/lib/interview-timeline";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Require authenticated session
  const { user } = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("eventType") as EventType | null;
  const fromTimestamp = searchParams.get("fromTimestamp");
  const toTimestamp = searchParams.get("toTimestamp");
  const format = searchParams.get("format"); // "replay" for full report

  try {
    if (format === "replay") {
      const report = await generateReplayReport(id);
      return Response.json(report);
    }

    const timeline = await getTimeline(id, {
      eventType: eventType || undefined,
      fromTimestamp: fromTimestamp ? new Date(fromTimestamp) : undefined,
      toTimestamp: toTimestamp ? new Date(toTimestamp) : undefined,
    });

    return Response.json({
      interviewId: id,
      events: timeline,
      count: timeline.length,
    });
  } catch (error) {
    console.error(`[${id}] Timeline API error:`, error);
    return Response.json(
      { error: "Failed to retrieve timeline" },
      { status: 500 }
    );
  }
}

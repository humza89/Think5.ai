/**
 * Admin Replay Diagnostics Endpoint (REM-8)
 *
 * Returns the full ReplayReport for a given interview, including:
 * - Unified chronological timeline (turns + events + facts)
 * - Divergence points (turn gaps, timing anomalies)
 * - Continuity score
 * - Summary statistics
 *
 * Access: Admin-only (requires ADMIN_SECRET header)
 */

import { NextRequest } from "next/server";
import { reconstructReplay } from "@/lib/replay-reconstructor";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Admin auth check
  const adminSecret = request.headers.get("x-admin-secret");
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await reconstructReplay(id);
    return Response.json(report);
  } catch (err) {
    console.error(JSON.stringify({
      event: "replay_reconstruction_failure",
      interviewId: id,
      error: (err as Error).message,
      severity: "error",
      timestamp: new Date().toISOString(),
    }));
    return Response.json(
      { error: "Failed to reconstruct replay" },
      { status: 500 }
    );
  }
}

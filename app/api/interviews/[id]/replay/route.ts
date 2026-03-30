/**
 * Replay Diagnostics Endpoint — One-click timeline reconstruction
 *
 * GET /api/interviews/{id}/replay
 *
 * Returns a unified timeline that interleaves conversation turns,
 * state transitions, memory mutations, gate actions, and reconnect events.
 * Used for post-interview debugging and compliance auditing.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconstructReplay } from "@/lib/replay-reconstructor";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth check
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { accessToken: true },
  });
  if (!interview || interview.accessToken !== accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await reconstructReplay(id);
    return Response.json(report);
  } catch (err) {
    console.error(`[replay] Failed for ${id}:`, err);
    return Response.json(
      { error: "Failed to reconstruct replay" },
      { status: 500 }
    );
  }
}

/**
 * Fragment Persistence Endpoint — N4: Server-side turn fragment storage
 *
 * POST /api/interviews/{id}/voice/fragment
 *
 * Called by the client when a turn is interrupted to persist
 * partial content server-side. Prevents data loss on disconnect.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { persistFragment } from "@/lib/turn-fragment-store";

export async function POST(
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

  let body: { chunkId: string; role: string; content: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.chunkId || !body.role || !body.content) {
    return Response.json({ error: "Missing required fields: chunkId, role, content" }, { status: 400 });
  }

  try {
    await persistFragment(
      id,
      body.chunkId,
      body.role,
      body.content,
      (body.status as "in_progress" | "interrupted") || "interrupted"
    );
    return Response.json({ stored: true });
  } catch (err) {
    console.error(`[${id}] Fragment persistence failed:`, err);
    return Response.json({ error: "Fragment persistence failed" }, { status: 500 });
  }
}

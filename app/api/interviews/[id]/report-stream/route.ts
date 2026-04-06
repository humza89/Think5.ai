import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/interviews/[id]/report-stream?token=...
 *
 * Server-Sent Events endpoint for real-time report generation status.
 * Replaces polling with push-based updates.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 401 });
  }

  // Validate access
  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { accessToken: true, reportStatus: true },
  });

  if (!interview || interview.accessToken !== token) {
    return new Response("Unauthorized", { status: 401 });
  }

  // If report is already complete, send immediately and close
  if (interview.reportStatus === "completed") {
    const body = `data: ${JSON.stringify({ stage: "complete", ready: true })}\n\n`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Stream status updates
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let pollCount = 0;
      const MAX_POLLS = 60; // 5 minutes at 5s intervals

      const sendEvent = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Send initial status
      sendEvent({ stage: mapStatus(interview.reportStatus || "pending"), ready: false });

      // Poll database for status changes
      const interval = setInterval(async () => {
        if (closed || pollCount >= MAX_POLLS) {
          clearInterval(interval);
          if (!closed) {
            sendEvent({ stage: "failed", ready: false, timeout: true });
            controller.close();
          }
          return;
        }

        pollCount++;

        try {
          const current = await prisma.interview.findUnique({
            where: { id },
            select: { reportStatus: true },
          });

          if (!current) {
            clearInterval(interval);
            sendEvent({ stage: "failed", ready: false });
            if (!closed) controller.close();
            return;
          }

          const stage = mapStatus(current.reportStatus || "pending");
          sendEvent({ stage, ready: stage === "complete" });

          if (stage === "complete" || stage === "failed") {
            clearInterval(interval);
            if (!closed) controller.close();
          }
        } catch {
          // Keep trying
        }
      }, 5000);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function mapStatus(dbStatus: string): string {
  switch (dbStatus) {
    case "pending": return "generating";
    case "generating": return "scoring";
    case "completed": return "complete";
    case "failed": return "failed";
    default: return "generating";
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logInterviewActivity } from "@/lib/interview-audit";
import { getSession, transition } from "@/lib/session-service";

const MAX_PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Cron job: Auto-cancel interviews paused for more than 10 minutes.
 * Runs every 2 minutes via Vercel cron.
 */
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - MAX_PAUSE_DURATION_MS);

    const expiredPauses: Array<{ id: string; candidateId: string; pausedAt: Date | null }> = await prisma.interview.findMany({
      where: {
        status: "PAUSED",
        pausedAt: { lt: cutoff },
      },
      select: { id: true, candidateId: true, pausedAt: true },
    });

    if (expiredPauses.length === 0) {
      return NextResponse.json({ cancelled: 0 });
    }

    await prisma.interview.updateMany({
      where: { id: { in: expiredPauses.map((i) => i.id) } },
      data: {
        status: "CANCELLED",
        pausedAt: null,
        completedAt: new Date(),
      },
    });

    // Phase 2.1: after cancelling in Postgres, transition the lifecycle record
    // so the relay (if it's still holding a zombie connection) stops trying
    // to recover the session. Best-effort: lifecycle may not exist for older
    // interviews created before SessionService was deployed.
    for (const interview of expiredPauses) {
      const current = await getSession(interview.id).catch(() => null);
      if (current && current.state === "paused") {
        await transition({
          interviewId: interview.id,
          expectedFrom: "paused",
          to: "failed",
          reason: "pause_timeout_exceeded",
        }).catch(() => {});
      }

      logInterviewActivity({
        interviewId: interview.id,
        action: "interview.pause_timeout_cancelled",
        userId: "system",
        userRole: "system",
        metadata: {
          pausedAt: interview.pausedAt?.toISOString(),
          cancelledAt: new Date().toISOString(),
          reason: "Exceeded 10-minute pause limit",
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      cancelled: expiredPauses.length,
      interviewIds: expiredPauses.map((i) => i.id),
    });
  } catch (error) {
    console.error("[cron/pause-timeout] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse, NextRequest } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

/**
 * Cron: Fragment Cleanup
 * Deletes stale TurnFragment records older than 24 hours
 * that were never finalized. Prevents indefinite accumulation.
 *
 * Schedule: Every 6 hours
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const result = await prisma.turnFragment.deleteMany({
      where: {
        status: { not: "finalized" },
        createdAt: { lt: cutoff },
      },
    });

    return NextResponse.json({
      success: true,
      deletedFragments: result.count,
      cutoffDate: cutoff.toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Fragment cleanup failed" },
      { status: 500 }
    );
  }
}

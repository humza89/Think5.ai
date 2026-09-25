import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/cron-auth";

/**
 * Retention purge (Phase 0 T5). Anonymises PII on candidates whose
 * interviews all finished more than 30 days ago. Scheduled in vercel.json
 * (30 3 * * *). Vercel crons call GET; POST stays as a compatibility alias.
 *
 * Before T5 this route filtered on a non-existent "FAILED" status and a
 * "piiPurgedAt" column that did not exist, so it could never run.
 */
const PURGE_AFTER_DAYS = 30;
const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "EXPIRED"] as const;

export async function runRetentionPurge(now: Date = new Date()): Promise<{ purgedCount: number; candidateIds: string[] }> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const expiredInterviews = await prisma.interview.findMany({
    where: {
      status: { in: [...TERMINAL_STATUSES] },
      updatedAt: { lt: cutoff },
      candidate: { piiPurgedAt: null, legalHold: false },
    },
    select: { candidateId: true },
  });
  const candidateIds: string[] = [...new Set<string>(expiredInterviews.map((i: { candidateId: string }) => i.candidateId))];
  if (candidateIds.length === 0) return { purgedCount: 0, candidateIds };

  const result = await prisma.candidate.updateMany({
    where: { id: { in: candidateIds }, piiPurgedAt: null, legalHold: false },
    data: {
      fullName: "Purged Candidate",
      email: null,
      phone: null,
      linkedinUrl: null,
      resumeText: "PURGED FOR COMPLIANCE",
      resumeUrl: null,
      profileImage: null,
      piiPurgedAt: now,
    },
  });
  return { purgedCount: result.count, candidateIds };
}

async function handle(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    const { purgedCount } = await runRetentionPurge();
    if (purgedCount === 0) return NextResponse.json({ success: true, purgedCount: 0, message: "No candidates to purge" });
    return NextResponse.json({ success: true, purgedCount });
  } catch (error) {
    console.error("[retention-purge] failed:", error);
    return NextResponse.json({ error: "Failed to purge PII" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

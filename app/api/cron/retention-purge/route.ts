import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Enforce cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find completed interviews older than 30 days that have not been purged
    const expiredInterviews = await prisma.interview.findMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        updatedAt: { lt: thirtyDaysAgo },
        candidate: {
          piiPurgedAt: null
        }
      },
      select: { candidateId: true }
    });

    const candidateIds = expiredInterviews.map((i: { candidateId: string }) => i.candidateId);

    if (candidateIds.length === 0) {
       return NextResponse.json({ message: "No candidates to purge" });
    }

    // Purge candidate PII (Soft delete approach: anonymize fields)
    const result = await prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: {
        fullName: "Purged Candidate",
        email: "purged@anonymized.local",
        phone: null,
        resumeText: "PURGED FOR COMPLIANCE",
        piiPurgedAt: new Date()
      } as any
    });

    return NextResponse.json({ success: true, purgedCount: result.count });
  } catch (err) {
    return NextResponse.json({ error: "Failed to purge PII" }, { status: 500 });
  }
}

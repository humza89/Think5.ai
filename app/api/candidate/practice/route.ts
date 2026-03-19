import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateRole, handleAuthError } from "@/lib/auth";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { candidate } = await requireCandidateRole();
    const body = await request.json();
    const { type = "TECHNICAL" } = body;

    const validTypes = ["TECHNICAL", "BEHAVIORAL", "DOMAIN_EXPERT", "LANGUAGE", "CASE_STUDY"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid interview type" },
        { status: 400 }
      );
    }

    // Rate limit: max 5 practice interviews per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const practiceCount = await prisma.interview.count({
      where: {
        candidateId: candidate.id,
        isPractice: true,
        createdAt: { gte: today },
      },
    });

    if (practiceCount >= 5) {
      return NextResponse.json(
        { error: "Daily practice limit reached (5 per day). Try again tomorrow." },
        { status: 429 }
      );
    }

    // Generate access token
    const accessToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // 1-day expiry for practice

    // Create practice interview — use candidate's own recruiterId
    const interview = await prisma.interview.create({
      data: {
        candidateId: candidate.id,
        scheduledBy: candidate.recruiterId,
        type: type as "TECHNICAL" | "BEHAVIORAL" | "DOMAIN_EXPERT" | "LANGUAGE" | "CASE_STUDY",
        status: "PENDING",
        isPractice: true,
        voiceProvider: "text-sse",
        accessToken,
        accessTokenExpiresAt: expiresAt,
      },
    });

    return NextResponse.json({
      interviewId: interview.id,
      accessToken,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

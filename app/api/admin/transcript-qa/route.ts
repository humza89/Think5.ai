/**
 * Transcript QA Scoring Endpoint
 *
 * Admin-only POST endpoint that runs automated quality assessment
 * on an interview transcript and returns dimension scores.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreTranscript, TranscriptEntry } from "@/lib/transcript-qa-scorer";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require admin role — this endpoint exposes interview transcripts
    await requireRole(["admin"]);

    const body = await request.json();
    const { interviewId } = body;

    if (!interviewId) {
      return Response.json({ error: "interviewId is required" }, { status: 400 });
    }

    // Load interview transcript
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        transcript: true,
        status: true,
        completedAt: true,
      },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    const transcript = (interview.transcript || []) as TranscriptEntry[];

    if (transcript.length === 0) {
      return Response.json({
        error: "No transcript available for this interview",
      }, { status: 400 });
    }

    // Run programmatic QA scoring
    const result = scoreTranscript(interviewId, transcript);

    return Response.json({
      ...result,
      interviewStatus: interview.status,
      completedAt: interview.completedAt,
      transcriptLength: transcript.length,
    });
  } catch (error) {
    console.error("Transcript QA error:", error);
    return Response.json(
      { error: "Failed to score transcript" },
      { status: 500 }
    );
  }
}

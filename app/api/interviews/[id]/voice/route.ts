/**
 * Voice Interview Persistence
 *
 * Stateless server endpoints for voice interview lifecycle:
 * - checkpoint: Periodic transcript/score saves during interview
 * - end_interview: Final save, status update, report generation
 *
 * The actual Gemini Live WebSocket runs client-side (browser).
 * This endpoint only handles persistence to the database.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReportInBackground } from "@/lib/report-generator";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { persistProctoringEvents } from "@/lib/proctoring-normalizer";
import { isValidTransition } from "@/lib/interview-state-machine";
import {
  saveSessionState,
  deleteSessionState,
  refreshSessionTTL,
  recordHeartbeat,
  releaseSessionLock,
  getSessionState,
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";
import { validateTranscript } from "@/lib/transcript-validator";
import * as Sentry from "@sentry/nextjs";

// ── Validate Access ────────────────────────────────────────────────────

async function validateAccess(interviewId: string, accessToken: string | null) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          onboardingStatus: true,
        },
      },
      template: true,
    },
  });

  if (!interview) return null;

  if (accessToken && interview.accessToken === accessToken) {
    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return null;
    }
    return interview;
  }

  return null;
}

// ── POST: Handle voice interview actions ─────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { action, accessToken, transcript, moduleScores, questionCount } = body;

    // Validate access
    const interview = await validateAccess(id, accessToken);
    if (!interview) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check eligibility
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return Response.json({ error: eligibility.reason }, { status: 403 });
    }

    // ── Refresh TTL: keep session alive during active use ──
    if (action === "refresh_ttl") {
      await refreshSessionTTL(id);
      await recordHeartbeat(id);
      return Response.json({ ok: true });
    }

    // ── Checkpoint: periodic transcript save ──
    if (action === "checkpoint") {
      const checkpointStart = Date.now();

      await prisma.interview.update({
        where: { id },
        data: {
          transcript: transcript || [],
          skillModuleScores: moduleScores || [],
        },
      });

      // Sync to durable session store
      const existingSession = await getSessionState(id);
      if (existingSession) {
        await saveSessionState(id, {
          ...existingSession,
          transcript: transcript || [],
          moduleScores: moduleScores || [],
          questionCount: questionCount || existingSession.questionCount,
          lastActiveAt: new Date().toISOString(),
        });
      }
      await refreshSessionTTL(id);

      // Record checkpoint latency SLO
      const checkpointMs = Date.now() - checkpointStart;
      await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);

      return Response.json({ ok: true });
    }

    // ── End Interview: final save + report generation ──
    if (action === "end_interview") {
      // Audit log
      logInterviewActivity({
        interviewId: id,
        action: "interview.voice_ended",
        userId: interview.candidate.id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      // Validate state transition
      const currentStatus = interview.status;
      if (!isValidTransition(currentStatus, "COMPLETED")) {
        console.warn(`[${id}] Invalid voice end transition: ${currentStatus} → COMPLETED`);
      }

      // Save transcript, scores, and mark complete
      await prisma.interview.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          transcript: transcript || [],
          skillModuleScores: moduleScores || [],
        },
      });

      // Persist structured proctoring events
      const interviewData = await prisma.interview.findUnique({
        where: { id },
        select: { integrityEvents: true },
      });
      if (interviewData?.integrityEvents && Array.isArray(interviewData.integrityEvents)) {
        persistProctoringEvents(id, interviewData.integrityEvents as any[]).catch(console.error);
      }

      // Validate transcript quality (log warnings, don't block)
      if (transcript && transcript.length > 0) {
        const validation = validateTranscript(transcript);
        if (!validation.valid) {
          console.warn(`[${id}] Transcript quality issues:`, validation.issues);
          Sentry.addBreadcrumb({
            category: "transcript_qa",
            message: `${validation.issues.length} issue(s): ${validation.issues.map(i => i.type).join(", ")}`,
            level: "warning",
          });
        }
      }

      // Clean up durable session state and release lock
      await deleteSessionState(id);
      await releaseSessionLock(id);

      // Generate report in background
      generateReportInBackground(id).catch(console.error);

      return Response.json({ ok: true, message: "Interview ended" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    Sentry.captureException(error, { tags: { component: "voice_route" } });
    console.error("Voice route error:", error);
    const classified = classifyError(error, { statusCode: 500 });
    return Response.json(
      { error: classified.message, code: classified.title, recoverable: classified.recoverable },
      { status: 500 }
    );
  }
}

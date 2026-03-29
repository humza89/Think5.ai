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
import { inngest } from "@/inngest/client";
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
  refreshSessionLock,
  getSessionState,
  computeTranscriptChecksum,
} from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";
import { validateTranscript, repairTranscript } from "@/lib/transcript-validator";
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
    const { action, accessToken, transcript, moduleScores, questionCount,
      currentDifficultyLevel, flaggedFollowUps, currentModule, candidateProfile, sessionSummary } = body;

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

    // ── Record SLO: client-reported SLO events ──
    if (action === "record_slo") {
      const { sloName, success, durationMs } = body;
      // SECURITY: Only accept known SLO names to prevent Redis key spam
      const ALLOWED_CLIENT_SLOS = new Set([
        "interview.start.success_rate",
        "session.reconnect.success_rate",
        "session.reconnect.latency_p95",
        "session.reconnect.context_loss.rate",
        "recording.upload.success_rate",
      ]);
      if (!sloName || !ALLOWED_CLIENT_SLOS.has(sloName)) {
        return Response.json({ error: "Invalid SLO name" }, { status: 400 });
      }
      if (typeof success === "boolean") {
        await recordSLOEvent(sloName, success, durationMs);
      }
      return Response.json({ ok: true });
    }

    // ── Per-interview reliability metrics ──
    if (action === "record_metric") {
      const { event: metricEvent, ...metricData } = body;
      try {
        const redis = await import("@upstash/redis").then(({ Redis }) =>
          new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
          })
        );
        const key = `interview:metrics:${id}`;
        const existing = await redis.get(key) as Record<string, unknown> | null;
        const metrics = existing || {};
        // Merge metric event
        if (metricEvent === "connected") {
          metrics.connectedAt = new Date().toISOString();
          metrics.connectAttempt = metricData.attempt ?? 0;
        } else if (metricEvent === "reconnect") {
          metrics.reconnectCount = ((metrics.reconnectCount as number) || 0) + 1;
          metrics.lastReconnectMs = metricData.durationMs;
        } else if (metricEvent === "completed") {
          metrics.completedAt = new Date().toISOString();
          metrics.totalReconnects = metricData.totalReconnects;
          metrics.durationSeconds = metricData.durationSeconds;
          metrics.questionCount = metricData.questionCount;
        } else if (metricEvent === "checkpoint_failure") {
          metrics.checkpointFailures = ((metrics.checkpointFailures as number) || 0) + 1;
        }
        await redis.set(key, JSON.stringify(metrics), { ex: 86400 }); // 24h TTL
      } catch { /* best-effort metrics */ }
      return Response.json({ ok: true });
    }

    // ── Refresh TTL: keep session alive during active use ──
    if (action === "refresh_ttl") {
      // Enforce max interview duration (90 minutes hard cap)
      const interview = await prisma.interview.findUnique({
        where: { id },
        select: { startedAt: true },
      });
      if (interview?.startedAt) {
        const elapsed = Date.now() - new Date(interview.startedAt).getTime();
        if (elapsed > 90 * 60 * 1000) {
          return Response.json(
            { error: "Maximum interview duration exceeded", forceEnd: true },
            { status: 410 }
          );
        }
      }

      await refreshSessionTTL(id);
      await recordHeartbeat(id);
      await refreshSessionLock(id);
      return Response.json({ ok: true });
    }

    // ── Checkpoint: periodic transcript save ──
    if (action === "checkpoint") {
      const checkpointStart = Date.now();

      // Idempotency: skip write if transcript hasn't changed since last checkpoint
      const currentTranscript = transcript || [];
      const incomingDigest = computeTranscriptChecksum(currentTranscript);
      const existingSession = await getSessionState(id);
      if (existingSession?.checkpointDigest === incomingDigest) {
        // Transcript identical — refresh TTL but skip DB write
        await refreshSessionTTL(id);
        const checkpointMs = Date.now() - checkpointStart;
        await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);
        return Response.json({ ok: true, deduplicated: true, checkpointMs });
      }

      await prisma.interview.update({
        where: { id },
        data: {
          transcript: currentTranscript,
          skillModuleScores: moduleScores || [],
        },
      });

      // Sync to durable session store with checkpoint digest + enterprise memory fields
      if (existingSession) {
        await saveSessionState(id, {
          ...existingSession,
          transcript: currentTranscript,
          moduleScores: moduleScores || [],
          questionCount: questionCount || existingSession.questionCount,
          lastActiveAt: new Date().toISOString(),
          checkpointDigest: incomingDigest,
          lastTurnIndex: currentTranscript.length - 1,
          // Enterprise memory fields — merge from client checkpoint
          ...(currentDifficultyLevel && { currentDifficultyLevel }),
          ...(flaggedFollowUps && { flaggedFollowUps }),
          ...(currentModule && { currentModule }),
          ...(candidateProfile && { candidateProfile }),
          ...(sessionSummary && { sessionSummary }),
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

      // Validate and auto-repair transcript quality
      if (transcript && transcript.length > 0) {
        const validation = validateTranscript(transcript);

        // Record transcript anomaly SLO
        await recordSLOEvent("transcript.anomaly.rate", validation.valid);

        if (!validation.valid || validation.issues.length > 0) {
          console.warn(`[${id}] Transcript quality issues:`, validation.issues);
          Sentry.addBreadcrumb({
            category: "transcript_qa",
            message: `${validation.issues.length} issue(s): ${validation.issues.map(i => i.type).join(", ")}`,
            level: "warning",
          });

          // Auto-repair if issues found
          const { repaired, repairs } = repairTranscript(transcript);
          if (repairs.length > 0) {
            console.log(`[${id}] Transcript auto-repair: ${repairs.join("; ")}`);
            await prisma.interview.update({
              where: { id },
              data: { transcript: repaired },
            });
          }
        }
      }

      // Record session completion SLO
      await recordSLOEvent("session.30min_completion.rate", true);
      // Record no hard-stop (normal completion = success)
      await recordSLOEvent("session.hard_stop.rate", true);

      // Clean up durable session state and release lock
      await deleteSessionState(id);
      await releaseSessionLock(id);

      // Generate report via durable Inngest queue (with in-process fallback)
      inngest
        .send({ name: "interview/completed", data: { interviewId: id } })
        .catch((err: unknown) => {
          console.error("Inngest dispatch failed, falling back to in-process:", err);
          generateReportInBackground(id).catch(console.error);
        });

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

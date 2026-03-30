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
import { appendTurns, getLedgerSnapshot, diffTurns, finalizeLedger, getFullTranscript } from "@/lib/conversation-ledger";
import { classifyError } from "@/lib/error-classification";
import { validateTranscript, repairTranscript } from "@/lib/transcript-validator";
import { isMaintenanceMode, getMaintenanceMessage, maintenanceResponse } from "@/lib/maintenance-mode";
import { recordEvent } from "@/lib/interview-timeline";
import { isEnabled } from "@/lib/feature-flags";
import { extractFactsImmediate } from "@/lib/fact-extractor";
import { verifyGrounding } from "@/lib/grounding-gate";
import * as Sentry from "@sentry/nextjs";

// C7: Per-interview checkpoint rate limiter (max 1 per 2 seconds)
const checkpointTimestamps = new Map<string, number>();

// C4: Validate moduleScores structure before DB write
function validateModuleScores(scores: unknown): Array<{ module: string; score: number; reason: string; sectionNotes?: string }> {
  if (!Array.isArray(scores)) return [];
  return scores
    .filter((s: unknown) => {
      if (!s || typeof s !== "object") return false;
      const r = s as Record<string, unknown>;
      return typeof r.module === "string" && typeof r.score === "number" &&
        typeof r.reason === "string" && r.score >= 0 && r.score <= 10;
    })
    .map((s: unknown) => {
      const r = s as Record<string, unknown>;
      return {
        module: String(r.module).slice(0, 100),
        score: Number(r.score),
        reason: String(r.reason).slice(0, 500),
        ...(typeof r.sectionNotes === "string" ? { sectionNotes: String(r.sectionNotes).slice(0, 1000) } : {}),
      };
    })
    .slice(0, 20);
}

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

  // Fail-fast: maintenance mode check before any work
  if (await isMaintenanceMode()) {
    const msg = await getMaintenanceMessage();
    return maintenanceResponse(msg);
  }

  try {
    const body = await request.json();
    const { action, accessToken, transcript, moduleScores, questionCount,
      currentDifficultyLevel, flaggedFollowUps, currentModule, candidateProfile, askedQuestions } = body;

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

      // C7: Rate limit checkpoints — max 1 per 2 seconds per interview
      const lastCheckpoint = checkpointTimestamps.get(id);
      const now = Date.now();
      if (lastCheckpoint && now - lastCheckpoint < 2000) {
        return Response.json({ ok: true, throttled: true });
      }
      checkpointTimestamps.set(id, now);

      // C2/R5: Evict stale checkpoint timestamps to prevent memory leak
      if (checkpointTimestamps.size > 1000) {
        for (const [key, ts] of checkpointTimestamps) {
          if (now - ts > 3600_000) checkpointTimestamps.delete(key);
        }
      }

      // H10: Reject oversized transcripts (>1MB serialized)
      const currentTranscript = transcript || [];
      if (JSON.stringify(currentTranscript).length > 1_000_000) {
        return Response.json({ error: "Transcript too large" }, { status: 413 });
      }
      const incomingDigest = computeTranscriptChecksum(currentTranscript);
      const existingSession = await getSessionState(id);
      if (existingSession?.checkpointDigest === incomingDigest) {
        // Transcript identical — refresh TTL but skip DB write
        await refreshSessionTTL(id);
        const checkpointMs = Date.now() - checkpointStart;
        await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);
        return Response.json({ ok: true, deduplicated: true, checkpointMs, checkpointDigest: existingSession?.checkpointDigest });
      }

      const validatedScores = validateModuleScores(moduleScores);

      // Write to canonical conversation ledger (Tier 0: lossless, never truncated)
      const ledgerSnapshot = await getLedgerSnapshot(id);
      const newTurns = diffTurns(currentTranscript, ledgerSnapshot.latestTurnIndex);
      let ledgerVersion = ledgerSnapshot.latestTurnIndex;
      if (newTurns.length > 0) {
        const appended = await appendTurns(id, newTurns, ledgerSnapshot.turnCount);
        if (appended.length > 0) {
          ledgerVersion = appended[appended.length - 1].turnIndex;
        }
      }

      // Timeline observability: record checkpoint event
      if (isEnabled("TIMELINE_OBSERVABILITY")) {
        recordEvent(id, "checkpoint", {
          ledgerVersion,
          newTurnsAppended: newTurns.length,
          questionCount: questionCount || 0,
        }, ledgerVersion).catch(() => {});
      }

      // Tier 1 memory: extract and persist structured facts from new candidate turns
      if (isEnabled("MEMORY_TIERS") && newTurns.length > 0) {
        try {
          const candidateTurns = newTurns
            .filter((t: { role: string }) => t.role === "candidate" || t.role === "user")
            .map((t: { role: string; content: string }, i: number) => ({
              turnId: `turn-${ledgerVersion - newTurns.length + i + 1}`,
              role: "candidate",
              content: typeof t.content === "string" ? t.content : "",
            }));
          const facts = extractFactsImmediate(candidateTurns[0] || { turnId: "", role: "candidate", content: "" });
          if (facts.length > 0 && candidateTurns.length > 0) {
            // Batch extract across all new candidate turns
            const allFacts = candidateTurns.flatMap((turn: { turnId: string; role: string; content: string }) => extractFactsImmediate(turn));
            await prisma.interviewFact.createMany({
              data: allFacts.map((f) => ({
                interviewId: id,
                turnId: f.turnId,
                factType: f.factType,
                content: f.content,
                confidence: f.confidence,
                extractedBy: f.extractedBy,
              })),
              skipDuplicates: true,
            });
          }
        } catch (err) {
          console.warn(`[${id}] Fact extraction failed (non-fatal):`, err);
        }
      }

      // Grounding gate: verify AI responses against extracted facts
      if (isEnabled("GROUNDING_GATE_ENABLED") && newTurns.length > 0) {
        try {
          const aiTurns = newTurns.filter((t: { role: string }) => t.role === "assistant" || t.role === "model");
          if (aiTurns.length > 0) {
            const recentFacts = await prisma.interviewFact.findMany({
              where: { interviewId: id },
              orderBy: { createdAt: "desc" },
              take: 50,
            });
            for (const aiTurn of aiTurns) {
              const content = typeof aiTurn.content === "string" ? aiTurn.content : "";
              if (content.length > 0) {
                const result = verifyGrounding(content, recentFacts.map((f: { turnId: string; factType: string; content: string; confidence: number; extractedBy: string }) => ({
                  turnId: f.turnId,
                  factType: f.factType as any,
                  content: f.content,
                  confidence: f.confidence,
                  extractedBy: f.extractedBy,
                })));
                if (!result.grounded) {
                  if (isEnabled("TIMELINE_OBSERVABILITY")) {
                    recordEvent(id, "grounding_failure", {
                      score: result.score,
                      unsupportedClaims: result.unsupportedClaims,
                      totalClaims: result.totalClaims,
                    }, ledgerVersion).catch(() => {});
                  }
                  // Trigger anomaly alerting via Inngest
                  inngest.send({
                    name: "interview/anomaly.detected",
                    data: { interviewId: id },
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[${id}] Grounding verification failed (non-fatal):`, err);
        }
      }

      // Denormalized cache on Interview record (backward compat — ledger is authoritative)
      await prisma.interview.update({
        where: { id },
        data: {
          transcript: currentTranscript,
          skillModuleScores: validatedScores,
        },
      });

      // Sync to durable session store with checkpoint digest + enterprise memory fields
      if (existingSession) {
        // Validate enterprise memory fields before persisting (silently drop invalid)
        const validatedMemory: Record<string, unknown> = {};
        if (typeof currentDifficultyLevel === "string" && currentDifficultyLevel.length <= 50) {
          validatedMemory.currentDifficultyLevel = currentDifficultyLevel;
        }
        if (typeof currentModule === "string" && currentModule.length <= 100) {
          validatedMemory.currentModule = currentModule;
        }
        if (Array.isArray(flaggedFollowUps) && flaggedFollowUps.length <= 20) {
          const validFollowUps = flaggedFollowUps.filter(
            (f: unknown) => f && typeof f === "object" &&
              typeof (f as Record<string, unknown>).topic === "string" && ((f as Record<string, unknown>).topic as string).trim().length > 0 && ((f as Record<string, unknown>).topic as string).length <= 500 &&
              typeof (f as Record<string, unknown>).reason === "string" && ((f as Record<string, unknown>).reason as string).trim().length > 0 && ((f as Record<string, unknown>).reason as string).length <= 500
          );
          if (validFollowUps.length > 0) validatedMemory.flaggedFollowUps = validFollowUps;
        }
        if (Array.isArray(askedQuestions) && askedQuestions.length <= 50) {
          const filtered = askedQuestions
            .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0 && (q as string).length <= 500)
            .slice(0, 50);
          validatedMemory.askedQuestions = [...new Set(filtered)];
        }
        if (candidateProfile && typeof candidateProfile === "object" && !Array.isArray(candidateProfile)) {
          const cp = candidateProfile as Record<string, unknown>;
          if (Array.isArray(cp.strengths) && cp.strengths.length <= 20 &&
              Array.isArray(cp.weaknesses) && cp.weaknesses.length <= 20) {
            validatedMemory.candidateProfile = {
              strengths: (cp.strengths as string[]).filter(s => typeof s === "string" && s.length <= 200).slice(0, 20),
              weaknesses: (cp.weaknesses as string[]).filter(s => typeof s === "string" && s.length <= 200).slice(0, 20),
              ...(typeof cp.communicationStyle === "string" && cp.communicationStyle.length <= 100 ? { communicationStyle: cp.communicationStyle } : {}),
              ...(typeof cp.confidenceLevel === "string" && ["low", "moderate", "high"].includes(cp.confidenceLevel) ? { confidenceLevel: cp.confidenceLevel } : {}),
              ...(typeof cp.notableObservations === "string" && cp.notableObservations.length <= 500 ? { notableObservations: cp.notableObservations } : {}),
            };
          }
        }

        await saveSessionState(id, {
          ...existingSession,
          moduleScores: validatedScores,
          questionCount: questionCount || existingSession.questionCount,
          lastActiveAt: new Date().toISOString(),
          checkpointDigest: incomingDigest,
          lastTurnIndex: ledgerVersion,
          ledgerVersion,
          stateHash: existingSession.stateHash || "",
          ...validatedMemory,
        });
      }
      await refreshSessionTTL(id);

      // Record checkpoint latency SLO
      const checkpointMs = Date.now() - checkpointStart;
      await recordSLOEvent("transcript.checkpoint.latency_p99", checkpointMs < 500, checkpointMs);

      // Task 4: Trigger knowledge graph update every 10 transcript turns
      if (currentTranscript.length > 0 && currentTranscript.length % 10 === 0) {
        inngest
          .send({ name: "interview/transcript_updated", data: { interviewId: id } })
          .catch((err: unknown) => {
            console.warn(`[${id}] Failed to trigger memory graph update:`, err);
          });
      }

      return Response.json({ ok: true, checkpointDigest: incomingDigest, ledgerVersion });
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

      // Timeline observability: record disconnect event
      if (isEnabled("TIMELINE_OBSERVABILITY")) {
        recordEvent(id, "disconnect", {
          reason: "normal_end",
          finalQuestionCount: questionCount || 0,
        }).catch(() => {});
      }

      // Validate state transition
      const currentStatus = interview.status;
      if (!isValidTransition(currentStatus, "COMPLETED")) {
        console.warn(`[${id}] Invalid voice end transition: ${currentStatus} → COMPLETED`);
      }

      // C2: Validate and auto-repair transcript BEFORE database write
      let finalTranscript = transcript || [];
      if (finalTranscript.length > 0) {
        const validation = validateTranscript(finalTranscript);

        // Record transcript anomaly SLO
        await recordSLOEvent("transcript.anomaly.rate", validation.valid);

        if (!validation.valid || validation.issues.length > 0) {
          console.warn(`[${id}] Transcript quality issues:`, validation.issues);
          Sentry.addBreadcrumb({
            category: "transcript_qa",
            message: `${validation.issues.length} issue(s): ${validation.issues.map(i => i.type).join(", ")}`,
            level: "warning",
          });

          const { repaired, repairs } = repairTranscript(finalTranscript);
          if (repairs.length > 0) {
            console.log(`[${id}] Transcript auto-repair: ${repairs.join("; ")}`);
            finalTranscript = repaired;
          }
        }
      }

      // Reconcile any remaining client turns into the canonical ledger
      const endLedgerSnapshot = await getLedgerSnapshot(id);
      const remainingTurns = diffTurns(finalTranscript, endLedgerSnapshot.latestTurnIndex);
      if (remainingTurns.length > 0) {
        await appendTurns(id, remainingTurns, endLedgerSnapshot.turnCount);
      }

      // Finalize all ledger turns (marks as immutable — no further appends allowed)
      const finalizedCount = await finalizeLedger(id);
      console.log(`[${id}] Ledger finalized: ${finalizedCount} turns marked immutable`);

      // Build denormalized transcript from canonical ledger for backward compatibility
      const canonicalTurns = await getFullTranscript(id);
      const denormalizedTranscript = canonicalTurns.map((t) => ({
        role: t.role,
        content: t.content,
        timestamp: t.timestamp.toISOString(),
      }));

      // Save denormalized transcript (ledger is authoritative), validated scores, and mark complete
      await prisma.interview.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          transcript: denormalizedTranscript,
          skillModuleScores: validateModuleScores(moduleScores),
        },
      });

      // C3: Persist structured proctoring events BEFORE report trigger
      const interviewData = await prisma.interview.findUnique({
        where: { id },
        select: { integrityEvents: true },
      });
      if (interviewData?.integrityEvents && Array.isArray(interviewData.integrityEvents)) {
        await persistProctoringEvents(id, interviewData.integrityEvents as any[]);
      }

      // Record session completion SLO
      await recordSLOEvent("session.30min_completion.rate", true);
      // Record no hard-stop (normal completion = success)
      await recordSLOEvent("session.hard_stop.rate", true);

      // Clean up durable session state and release lock (H5: pass owner token)
      const endSession = await getSessionState(id);
      await deleteSessionState(id);
      await releaseSessionLock(id, endSession?.lockOwnerToken);

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

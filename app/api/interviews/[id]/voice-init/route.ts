/**
 * Voice Interview Initialization
 *
 * Returns the system prompt, tool definitions, and API key
 * so the client can connect directly to Gemini Live via WebSocket.
 * This endpoint is stateless — no WebSocket is created server-side.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAriaVoicePrompt, buildReconnectSystemPrompt } from "@/lib/aria-prompts";
import { planToSystemContext } from "@/lib/interview-planner";
import { getInterviewTools } from "@/lib/gemini-live";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { isValidTransition } from "@/lib/interview-state-machine";
import { acquireSessionLock, swapSessionLock, releaseSessionLock, saveSessionState, getSessionState, generateReconnectToken } from "@/lib/session-store";
import { recordSLOEvent } from "@/lib/slo-monitor";
import { classifyError } from "@/lib/error-classification";
import * as Sentry from "@sentry/nextjs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  console.log(`[voice-init] Called for interview=${id}, VOICE_RELAY_URL=${process.env.VOICE_RELAY_URL ? "SET" : "MISSING"}, RELAY_JWT_SECRET=${process.env.RELAY_JWT_SECRET ? "SET" : "MISSING"}`);

  let lockOwnerToken = "";
  try {
    const body = await request.json();
    const { accessToken, reconnect, reconnectContext } = body;

    if (!accessToken) {
      return Response.json({ error: "Access token required" }, { status: 400 });
    }

    // Validate access
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            currentCompany: true,
            skills: true,
            experienceYears: true,
            resumeText: true,
            onboardingStatus: true,
          },
        },
        template: true,
      },
    });

    if (!interview || interview.accessToken !== accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[voice-init] Auth check: interview found=${!!interview}, token match=${interview?.accessToken === accessToken}`);

    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return Response.json({ error: "Access token expired" }, { status: 401 });
    }

    // Check eligibility
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return Response.json({ error: eligibility.reason }, { status: 403 });
    }

    // Consent check for non-practice interviews
    if (!interview.isPractice) {
      const consentCheck = await prisma.interview.findUnique({
        where: { id },
        select: { consentRecording: true, consentPrivacy: true, consentProctoring: true, consentedAt: true },
      });
      if (!consentCheck?.consentRecording || !consentCheck?.consentPrivacy || !consentCheck?.consentedAt) {
        return Response.json(
          { error: "Recording and privacy consent must be confirmed before starting." },
          { status: 403 }
        );
      }
      if (!consentCheck?.consentProctoring) {
        return Response.json(
          { error: "Proctoring consent must be confirmed before starting." },
          { status: 403 }
        );
      }
    }

    // Acquire session lock to prevent duplicate sessions
    // On reconnect: atomic swap (compare-and-swap) to avoid race condition
    if (reconnect) {
      const existingState = await getSessionState(id);
      const oldOwnerToken = existingState?.lockOwnerToken || "";
      const swapResult = await swapSessionLock(id, oldOwnerToken);
      if (!swapResult.acquired) {
        await recordSLOEvent("interview.start.success_rate", false);
        return Response.json(
          { error: "This interview is already active in another tab or device." },
          { status: 409 }
        );
      }
      lockOwnerToken = swapResult.ownerToken;
    } else {
      const lockResult = await acquireSessionLock(id);
      if (!lockResult.acquired) {
        await recordSLOEvent("interview.start.success_rate", false);
        return Response.json(
          { error: "This interview is already active in another tab or device." },
          { status: 409 }
        );
      }
      lockOwnerToken = lockResult.ownerToken;
    }

    // Build system prompt — reconnect-aware
    const basePrompt = buildAriaVoicePrompt({
      interviewType: interview.type as "TECHNICAL" | "BEHAVIORAL" | "DOMAIN_EXPERT" | "LANGUAGE" | "CASE_STUDY",
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      candidateCompany: interview.candidate.currentCompany,
      candidateSkills: interview.candidate.skills as string[] | undefined,
      candidateExperience: interview.candidate.experienceYears,
      resumeText: interview.candidate.resumeText,
    });

    let fullPrompt = basePrompt;
    if (interview.interviewPlan) {
      const planContext = planToSystemContext(interview.interviewPlan as any);
      fullPrompt += "\n\n" + planContext;
    }

    // On reconnect: enrich system prompt with full interview state so Gemini resumes seamlessly
    // Merge client-provided context with server-side persisted state (server wins for memory fields)
    if (reconnect && reconnectContext) {
      const serverState = await getSessionState(id);

      // Fetch LLM-powered knowledge graph from Postgres (built by inngest/update-aria-memory)
      const interviewWithGraph = await prisma.interview.findUnique({
        where: { id },
        select: { knowledgeGraph: true },
      });

      fullPrompt = buildReconnectSystemPrompt(fullPrompt, {
        questionCount: reconnectContext.questionCount || serverState?.questionCount || 0,
        moduleScores: serverState?.moduleScores || reconnectContext.moduleScores || [],
        askedQuestions: reconnectContext.askedQuestions || [],
        currentModule: serverState?.currentModule || reconnectContext.currentModule || null,
        candidateName: interview.candidate.fullName,
        // Enterprise memory fields from server-side persisted state
        currentDifficultyLevel: serverState?.currentDifficultyLevel,
        flaggedFollowUps: serverState?.flaggedFollowUps,
        candidateProfile: serverState?.candidateProfile,
        sessionSummary: serverState?.sessionSummary,
        // LLM-powered semantic memory from knowledge graph pipeline
        knowledgeGraph: interviewWithGraph?.knowledgeGraph as Record<string, unknown> | null,
      });
    }

    // Get tool definitions
    const tools = getInterviewTools();

    // Update interview status to IN_PROGRESS
    const currentStatus = interview.status;
    if (currentStatus !== "IN_PROGRESS") {
      if (!isValidTransition(currentStatus, "IN_PROGRESS")) {
        console.warn(`[${id}] Invalid voice init status transition: ${currentStatus} → IN_PROGRESS`);
      }
      await prisma.interview.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
          voiceProvider: "gemini-live",
        },
      });
    }

    // Audit log
    logInterviewActivity({
      interviewId: id,
      action: reconnect ? "interview.voice_reconnected" : "interview.voice_started",
      userId: interview.candidate.id,
      userRole: "candidate",
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    // Initialize or preserve durable session state
    const reconnectToken = generateReconnectToken(id);
    if (reconnect) {
      // RECONNECT: Preserve existing session state, only update token and timestamp
      const existingReconnectState = await getSessionState(id);
      if (existingReconnectState) {
        existingReconnectState.reconnectToken = reconnectToken;
        existingReconnectState.lastActiveAt = new Date().toISOString();
        existingReconnectState.reconnectCount = (existingReconnectState.reconnectCount || 0) + 1;
        existingReconnectState.lockOwnerToken = lockOwnerToken;
        await saveSessionState(id, existingReconnectState);
        console.log(`[voice-init] RECONNECT #${existingReconnectState.reconnectCount}: preserved ${existingReconnectState.transcript.length} transcript entries, ${existingReconnectState.questionCount} questions`);
      } else {
        // No existing state found (edge case) — initialize fresh
        await saveSessionState(id, {
          interviewId: id, transcript: [], moduleScores: [], questionCount: 0,
          reconnectToken, lastActiveAt: new Date().toISOString(),
          checkpointDigest: "", lastTurnIndex: -1, reconnectCount: 1,
          lockOwnerToken,
        });
      }
    } else {
      // FIRST CONNECT: Initialize fresh state
      await saveSessionState(id, {
        interviewId: id, transcript: [], moduleScores: [], questionCount: 0,
        reconnectToken, lastActiveAt: new Date().toISOString(),
        checkpointDigest: "", lastTurnIndex: -1, reconnectCount: 0,
        lockOwnerToken,
      });
    }

    // Record successful start SLO
    await recordSLOEvent("interview.start.success_rate", true);

    // Return config for client-side WebSocket connection via relay server.
    // SECURITY: API key never sent to client. Client authenticates to the
    // relay server with a signed JWT session token. The relay connects to
    // Gemini with the real API key server-side.
    const relayUrl = process.env.VOICE_RELAY_URL;
    if (!relayUrl) {
      return Response.json({ error: "Voice relay not configured" }, { status: 500 });
    }

    // Sign a short-lived JWT for relay authentication
    const { signRelayToken } = await import("@/lib/relay-jwt");
    const sessionToken = signRelayToken(id, interview.candidate.id);

    console.log(`[voice-init] SUCCESS: relayUrl=${relayUrl}, tokenLen=${sessionToken.length}, candidate=${interview.candidate.fullName}`);

    // On reconnect, include server-side enterprise memory fields so client refs stay in sync
    let enterpriseMemory: Record<string, unknown> | undefined;
    if (reconnect) {
      const serverState = await getSessionState(id);
      if (serverState) {
        enterpriseMemory = {
          currentDifficultyLevel: serverState.currentDifficultyLevel,
          flaggedFollowUps: serverState.flaggedFollowUps,
          currentModule: serverState.currentModule,
          candidateProfile: serverState.candidateProfile,
          sessionSummary: serverState.sessionSummary,
        };
      }
    }

    return Response.json({
      relayUrl,
      sessionToken,
      systemPrompt: fullPrompt,
      tools,
      voiceName: "Kore",
      candidateName: interview.candidate.fullName,
      model: "models/gemini-2.5-flash-native-audio-latest",
      reconnectToken,
      ...(enterpriseMemory ? { enterpriseMemory } : {}),
    }, {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    // Release lock if acquired before error — prevents 120s deadlock
    if (lockOwnerToken) {
      await releaseSessionLock(id, lockOwnerToken).catch(() => {});
    }
    Sentry.captureException(error, { tags: { component: "voice_init" } });
    console.error(`[voice-init] ERROR for interview=${id}:`, error instanceof Error ? error.message : error);
    await recordSLOEvent("interview.start.success_rate", false);
    const classified = classifyError(error, { statusCode: 500 });
    return Response.json(
      { error: classified.message, code: classified.title, recoverable: classified.recoverable },
      { status: 500 }
    );
  }
}

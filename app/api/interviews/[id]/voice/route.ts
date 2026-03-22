/**
 * Voice Interview WebSocket Relay
 *
 * Proxies bidirectional audio between the browser and Gemini Live API.
 * Handles session initialization, audio streaming, function calling
 * for adaptive interview behavior, and transcript management.
 *
 * Next.js doesn't natively support WebSocket upgrade in route handlers,
 * so this endpoint uses SSE for server→client streaming and accepts
 * audio via POST requests. For true WebSocket, a custom server is needed.
 *
 * Architecture:
 *   Browser → POST /voice (audio chunks + text) → Gemini Live → SSE → Browser
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createGeminiLiveSession,
  connectGeminiLive,
  sendAudio,
  sendText,
  sendToolResponse,
  closeSession,
  getInterviewTools,
  type GeminiLiveSession,
  type GeminiLiveCallbacks,
} from "@/lib/gemini-live";
import { buildAriaVoicePrompt } from "@/lib/aria-prompts";
import { planToSystemContext } from "@/lib/interview-planner";
import { generateReportInBackground } from "@/lib/report-generator";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { saveSessionState, deleteSessionState, generateReconnectToken, validateReconnectToken, type SessionState } from "@/lib/session-store";
import { persistProctoringEvents } from "@/lib/proctoring-normalizer";
import * as Sentry from "@sentry/nextjs";

// ── Active Sessions ──
// NOTE: The Gemini Live WebSocket connection is inherently stateful and
// cannot be serialized to Redis. In a Vercel serverless environment,
// the session Map is tied to the function instance. If the instance
// cold-starts, the WebSocket connection is lost and must be re-established.
// Session transcript and state are persisted to Redis (via session-store.ts)
// on every checkpoint to support reconnection after interruptions.

interface ActiveVoiceSession {
  geminiSession: GeminiLiveSession;
  interviewId: string;
  pendingAudioChunks: string[]; // base64 audio from AI, waiting to be sent to client
  pendingTextChunks: Array<{ role: string; text: string }>;
  pendingToolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  isEnded: boolean;
  questionCount: number;
  moduleScores: Array<{ module: string; score: number; reason: string }>;
}

const activeSessions = new Map<string, ActiveVoiceSession>();

// ── Validate Access ────────────────────────────────────────────────────

async function validateAccess(interviewId: string, accessToken: string | null) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
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

  if (!interview) return null;

  if (accessToken && interview.accessToken === accessToken) {
    if (
      interview.accessTokenExpiresAt &&
      new Date() > new Date(interview.accessTokenExpiresAt)
    ) {
      return null;
    }
    return interview;
  }

  return null;
}

// ── POST: Send audio/text to the voice session ─────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { type, data, message, action, accessToken } = body;

    // Validate access
    const interview = await validateAccess(id, accessToken);
    if (!interview) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check candidate eligibility for official interviews
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return Response.json({ error: eligibility.reason }, { status: 403 });
    }

    // ── Start Interview ──
    if (action === "begin_interview") {
      // P0.4: Block interview start unless consent is confirmed in DB
      // P0.2: Block interview start unless device readiness is verified
      if (!interview.isPractice) {
        const preStartCheck = await prisma.interview.findUnique({
          where: { id },
          select: { consentRecording: true, consentPrivacy: true, consentedAt: true, readinessVerified: true },
        });
        if (!preStartCheck?.consentRecording || !preStartCheck?.consentPrivacy || !preStartCheck?.consentedAt) {
          return Response.json(
            { error: "Recording and privacy consent must be confirmed before starting the interview. Please complete the consent step." },
            { status: 403 }
          );
        }
        if (!preStartCheck.readinessVerified) {
          return Response.json(
            { error: "Device readiness check must be completed before starting the interview." },
            { status: 403 }
          );
        }
      }

      // Audit log: voice started
      logInterviewActivity({
        interviewId: id,
        action: "interview.voice_started",
        userId: interview.candidate.id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});
      return await startVoiceInterview(id, interview);
    }

    // ── End Interview ──
    if (action === "end_interview") {
      // Audit log: voice ended
      logInterviewActivity({
        interviewId: id,
        action: "interview.voice_ended",
        userId: interview.candidate.id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});
      return await endVoiceInterview(id);
    }

    // ── Reconnect Session ──
    if (action === "reconnect") {
      const { reconnectToken: token } = body;
      if (!token) {
        return Response.json({ error: "Reconnect token required" }, { status: 400 });
      }
      const savedState = await validateReconnectToken(id, token);
      if (!savedState) {
        return Response.json({ error: "Invalid or expired reconnect token" }, { status: 401 });
      }
      // Return saved state for client-side session restoration
      return Response.json({
        ok: true,
        reconnected: true,
        transcript: savedState.transcript,
        questionCount: savedState.questionCount,
        moduleScores: savedState.moduleScores,
      });
    }

    // ── Send Audio ──
    if (type === "audio" && data) {
      const session = activeSessions.get(id);
      if (!session || session.isEnded) {
        return Response.json({ error: "No active session" }, { status: 400 });
      }

      sendAudio(session.geminiSession, data);
      return Response.json({ ok: true });
    }

    // ── Send Text (fallback) ──
    if (type === "text" && message) {
      const session = activeSessions.get(id);
      if (!session || session.isEnded) {
        return Response.json({ error: "No active session" }, { status: 400 });
      }

      sendText(session.geminiSession, message);
      return Response.json({ ok: true });
    }

    // ── Poll for responses ──
    if (type === "poll") {
      return pollSession(id);
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    Sentry.captureException(error, { tags: { component: "voice_route" } });
    console.error("Voice route error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── GET: SSE stream for receiving AI responses ─────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.nextUrl.searchParams.get("token");

  const interview = await validateAccess(id, accessToken);
  if (!interview) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // SSE stream for real-time AI audio + text responses
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const intervalId = setInterval(() => {
        const session = activeSessions.get(id);
        if (!session) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "waiting" })}\n\n`));
          return;
        }

        // Send pending audio chunks
        while (session.pendingAudioChunks.length > 0) {
          const audioChunk = session.pendingAudioChunks.shift()!;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "audio", data: audioChunk })}\n\n`
            )
          );
        }

        // Send pending text chunks
        while (session.pendingTextChunks.length > 0) {
          const textChunk = session.pendingTextChunks.shift()!;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", ...textChunk })}\n\n`
            )
          );
        }

        // Send pending tool calls (for UI updates like section changes)
        while (session.pendingToolCalls.length > 0) {
          const toolCall = session.pendingToolCalls.shift()!;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "toolCall", ...toolCall })}\n\n`
            )
          );
        }

        // Send question count update
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "questionCount", count: session.questionCount })}\n\n`
          )
        );

        // Check if interview ended
        if (session.isEnded) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "interviewEnd" })}\n\n`
            )
          );
          clearInterval(intervalId);
          controller.close();
        }
      }, 50); // 50ms polling for low latency

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── Transcript Checkpointing ────────────────────────────────────────────

const CHECKPOINT_INTERVAL = 3; // Aggressive checkpointing for session recovery

function maybeCheckpointTranscript(session: ActiveVoiceSession) {
  const transcript = session.geminiSession.transcript;
  if (transcript.length > 0 && transcript.length % CHECKPOINT_INTERVAL === 0) {
    // Fire-and-forget: persist transcript without blocking the response
    prisma.interview
      .update({
        where: { id: session.interviewId },
        data: { transcript: transcript as any },
      })
      .catch((err: unknown) =>
        console.error(
          `[${session.interviewId}] Transcript checkpoint failed:`,
          err
        )
      );

    // Also persist to Redis for durability
    saveSessionState(session.interviewId, {
      interviewId: session.interviewId,
      transcript: transcript as any,
      moduleScores: session.moduleScores,
      questionCount: session.questionCount,
      reconnectToken: "", // Will be set on start
      lastActiveAt: new Date().toISOString(),
    }).catch((err: unknown) => console.error("Redis checkpoint failed:", err));
  }
}

// ── Session Management ─────────────────────────────────────────────────

async function startVoiceInterview(
  interviewId: string,
  interview: NonNullable<Awaited<ReturnType<typeof validateAccess>>>
) {
  // Check if session already exists
  if (activeSessions.has(interviewId)) {
    return Response.json({ ok: true, message: "Session already active" });
  }

  // Build system prompt with interview plan
  const systemPrompt = buildAriaVoicePrompt({
    interviewType: interview.type as "TECHNICAL" | "BEHAVIORAL" | "DOMAIN_EXPERT" | "LANGUAGE" | "CASE_STUDY",
    candidateName: interview.candidate.fullName,
    candidateTitle: interview.candidate.currentTitle,
    candidateCompany: interview.candidate.currentCompany,
    candidateSkills: interview.candidate.skills as string[] | undefined,
    candidateExperience: interview.candidate.experienceYears,
    resumeText: interview.candidate.resumeText,
  });

  // Add interview plan context if available
  let fullPrompt = systemPrompt;
  if (interview.interviewPlan) {
    const planContext = planToSystemContext(interview.interviewPlan as any);
    fullPrompt += "\n\n" + planContext;
  }

  // Create active session
  const activeSession: ActiveVoiceSession = {
    geminiSession: createGeminiLiveSession(
      { systemInstruction: fullPrompt, voiceName: "Kore", tools: getInterviewTools() },
      {} as GeminiLiveCallbacks // Will be set up below
    ),
    interviewId,
    pendingAudioChunks: [],
    pendingTextChunks: [],
    pendingToolCalls: [],
    isEnded: false,
    questionCount: 0,
    moduleScores: [],
  };

  // Set up callbacks
  const callbacks: GeminiLiveCallbacks = {
    onAudio: (audioBase64) => {
      activeSession.pendingAudioChunks.push(audioBase64);
    },
    onText: (text, role) => {
      activeSession.pendingTextChunks.push({ role, text });
      // Count questions (heuristic: interviewer messages ending with ?)
      if (role === "interviewer" && text.includes("?")) {
        activeSession.questionCount++;
      }
      // Periodically checkpoint transcript to the database
      maybeCheckpointTranscript(activeSession);
    },
    onToolCall: (name, args) => {
      activeSession.pendingToolCalls.push({ name, args });
      handleToolCall(activeSession, name, args);
    },
    onTurnComplete: () => {
      activeSession.pendingTextChunks.push({
        role: "system",
        text: "__turn_complete__",
      });
    },
    onInterrupted: () => {
      // Candidate started speaking — stop AI audio
      activeSession.pendingAudioChunks = [];
    },
    onError: (error) => {
      Sentry.captureException(error, { tags: { component: "voice_session" }, extra: { interviewId } });
      console.error(`Voice session error [${interviewId}]:`, error);
      activeSession.pendingTextChunks.push({
        role: "system",
        text: `Error: ${error.message}`,
      });
    },
    onClose: () => {
      activeSession.isEnded = true;
    },
  };

  activeSessions.set(interviewId, activeSession);

  // Connect to Gemini Live API
  try {
    await connectGeminiLive(activeSession.geminiSession, {
      systemInstruction: fullPrompt,
      voiceName: "Kore",
      tools: getInterviewTools(),
      generationConfig: {
        temperature: 0.7,
        responseModalities: ["AUDIO", "TEXT"],
      },
    }, callbacks);

    // Generate reconnect token and update interview status
    const reconnToken = generateReconnectToken();
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        voiceProvider: "gemini-live",
        reconnectToken: reconnToken,
      },
    });

    // Persist initial session state to Redis for recovery
    saveSessionState(interviewId, {
      interviewId,
      transcript: [],
      moduleScores: [],
      questionCount: 0,
      reconnectToken: reconnToken,
      lastActiveAt: new Date().toISOString(),
    }).catch((err: unknown) => console.error("Initial session state save failed:", err));

    return Response.json({ ok: true, reconnectToken: reconnToken, message: "Voice session started" });
  } catch (error) {
    activeSessions.delete(interviewId);
    Sentry.captureException(error, { tags: { component: "gemini_live_connect" }, extra: { interviewId } });
    console.error("Failed to connect Gemini Live:", error);
    return Response.json(
      { error: "Failed to start voice session" },
      { status: 500 }
    );
  }
}

async function endVoiceInterview(interviewId: string) {
  const session = activeSessions.get(interviewId);
  if (!session) {
    return Response.json({ error: "No active session" }, { status: 400 });
  }

  // Close Gemini session
  closeSession(session.geminiSession);
  session.isEnded = true;

  // Save transcript and scores to database
  const transcript = session.geminiSession.transcript;
  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      transcript: transcript as any,
      skillModuleScores: session.moduleScores as any,
    },
  });

  // Persist structured proctoring events (fire-and-forget)
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { integrityEvents: true },
  });
  if (interview?.integrityEvents && Array.isArray(interview.integrityEvents)) {
    persistProctoringEvents(interviewId, interview.integrityEvents as any[]).catch(console.error);
  }

  // Generate report in background
  generateReportInBackground(interviewId).catch(console.error);

  // Cleanup
  activeSessions.delete(interviewId);

  return Response.json({ ok: true, message: "Interview ended" });
}

function pollSession(interviewId: string) {
  const session = activeSessions.get(interviewId);
  if (!session) {
    return Response.json({ active: false });
  }

  // Drain pending data
  const audio = [...session.pendingAudioChunks];
  const text = [...session.pendingTextChunks];
  const tools = [...session.pendingToolCalls];
  session.pendingAudioChunks = [];
  session.pendingTextChunks = [];
  session.pendingToolCalls = [];

  return Response.json({
    active: true,
    isEnded: session.isEnded,
    questionCount: session.questionCount,
    audio,
    text,
    tools,
  });
}

// ── Tool Call Handler ──────────────────────────────────────────────────

function handleToolCall(
  session: ActiveVoiceSession,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case "adjustDifficulty":
      console.log(
        `[${session.interviewId}] Difficulty: ${args.currentLevel} → ${args.newLevel} (${args.reason})`
      );
      // Acknowledge the tool call
      sendToolResponse(session.geminiSession, name, { acknowledged: true });
      break;

    case "moveToNextSection":
      console.log(
        `[${session.interviewId}] Section: ${args.currentSection} → ${args.nextSection} (${args.reason})`
      );
      // Record module score
      if (args.sectionScore !== undefined) {
        session.moduleScores.push({
          module: args.currentSection as string,
          score: args.sectionScore as number,
          reason: args.reason as string,
        });
      }
      sendToolResponse(session.geminiSession, name, { acknowledged: true });
      break;

    case "flagForFollowUp":
      console.log(
        `[${session.interviewId}] Follow-up: ${args.topic} (${args.reason})`
      );
      sendToolResponse(session.geminiSession, name, { acknowledged: true });
      break;

    case "endInterview":
      console.log(
        `[${session.interviewId}] End interview: ${args.reason}`
      );
      sendToolResponse(session.geminiSession, name, { acknowledged: true });
      // Schedule end after AI delivers closing message
      setTimeout(() => {
        endVoiceInterview(session.interviewId).catch(console.error);
      }, 5000);
      break;
  }
}

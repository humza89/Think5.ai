import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import {
  buildAriaSystemPrompt,
  countQuestionsFromTranscript,
} from "@/lib/aria-prompts";
import { planToSystemContext } from "@/lib/interview-planner";
import { generateReportInBackground } from "@/lib/report-generator";
import { inngest } from "@/inngest/client";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { isValidTransition } from "@/lib/interview-state-machine";
// Track 2: text-fallback path must go through the same atomic-finalization
// primitives as the voice path. See app/api/interviews/[id]/voice/route.ts
// for the voice equivalent.
import {
  beginFinalization,
  updateStage,
  evaluateManifest,
  markSatisfied,
  markFailed,
} from "@/lib/finalization-manifest";
import {
  withIdempotentFinalization,
  extractIdempotencyKey,
  InvalidIdempotencyKeyError,
} from "@/lib/finalization-idempotency";

interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
  mediaOffsetMs?: number;
}

async function validateAccess(
  interviewId: string,
  accessToken: string | null
) {
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
      template: {
        select: {
          readinessCheckRequired: true,
        },
      },
      job: {
        select: { title: true },
      },
    },
  });

  if (!interview) return null;

  // Validate via access token (candidate access)
  if (accessToken && interview.accessToken === accessToken) {
    // Check token expiry
    if (
      interview.accessTokenExpiresAt &&
      new Date() > new Date(interview.accessTokenExpiresAt)
    ) {
      return null;
    }
    return interview;
  }

  // If no valid access method, reject
  if (!accessToken) return null;

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const {
      message = "",
      action = "respond",
      accessToken = null,
      integrityEvents = null,
    } = body;

    // Validate access
    const interview = await validateAccess(id, accessToken);
    if (!interview) {
      return new Response(
        JSON.stringify({ error: "Unauthorized or interview not found" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check interview status
    if (interview.status === "COMPLETED" || interview.status === "CANCELLED" || interview.status === "EXPIRED") {
      return new Response(
        JSON.stringify({ error: "Interview is no longer active" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check candidate eligibility for official interviews
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return new Response(
        JSON.stringify({ error: eligibility.reason }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const existingTranscript = (interview.transcript as TranscriptEntry[]) || [];

    // Handle end action — Track 2 atomic finalization
    if (action === "end") {
      // Idempotency key (optional for legacy clients — synthesized if absent).
      let idempotencyKey: string | null;
      try {
        idempotencyKey = extractIdempotencyKey(request.headers);
      } catch (err) {
        if (err instanceof InvalidIdempotencyKeyError) {
          return Response.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
      if (!idempotencyKey) {
        idempotencyKey = `legacy-stream-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }

      // Wrap the finalization work in the idempotency helper so a client
      // retry with the same key gets the cached response.
      const idemResult = await withIdempotentFinalization(id, idempotencyKey, async () => {
        // Enter FINALIZING via the state machine. A direct
        // IN_PROGRESS → COMPLETED is no longer legal (Track 2 Task 8).
        const currentStatus = interview.status;
        if (!isValidTransition(currentStatus, "FINALIZING")) {
          return {
            body: {
              error: "Cannot finalize interview from current state",
              currentStatus,
              recoverable: false,
            },
            status: 409,
          };
        }

        await prisma.interview.update({
          where: { id },
          data: {
            status: "FINALIZING",
            ...(integrityEvents ? { integrityEvents } : {}),
          },
        });
        await beginFinalization(id, { reason: "stream_end_requested" });

        // Text path has no canonical ledger to finalize and no recording.
        // The transcript is the denormalized JSON that was already written
        // incrementally on the interview row. Stage statuses reflect this:
        //   ledgerStatus = 'finalized' (nothing to finalize, treat as done)
        //   recordingStatus = 'not_applicable'
        await updateStage(id, {
          ledgerStatus: "finalized",
          recordingStatus: "not_applicable",
          auditStatus: "complete",
          reason: "text_stream_path",
        });

        // Audit log: stream ended
        logInterviewActivity({
          interviewId: id,
          action: "interview.stream_ended",
          userId: interview.candidate.id,
          userRole: "candidate",
          ipAddress: getClientIp(request.headers),
        }).catch(() => {});

        // Dispatch report generation and record the outcome on the
        // manifest. Same contract as the voice path — we await the
        // Inngest send (rather than fire-and-forget) so a dispatch
        // failure actually gets caught and recorded.
        try {
          await inngest.send({ name: "interview/completed", data: { interviewId: id } });
          await updateStage(id, { reportStatus: "pending", reason: "inngest_dispatch:pending" });
        } catch (inngestErr) {
          console.error("Inngest dispatch failed, falling back to in-process:", inngestErr);
          generateReportInBackground(id).catch(console.error);
          await updateStage(id, { reportStatus: "pending", reason: "inngest_dispatch_fallback" });
        }

        // Manifest gate: only transition to COMPLETED if the manifest is satisfied.
        const evaluation = await evaluateManifest(id);
        if (!evaluation) {
          await markFailed(id, "manifest_missing_at_completion_gate");
          return {
            body: { error: "Finalization manifest missing", recoverable: false },
            status: 500,
          };
        }
        if (!evaluation.canComplete) {
          // Leave in FINALIZING — reconciler will finish the job.
          return {
            body: {
              ok: false,
              status: "FINALIZING",
              message: "Finalization in progress — reconciler will complete",
              missing: evaluation.missing,
            },
            status: 202,
          };
        }

        await prisma.interview.update({
          where: { id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await markSatisfied(id, "stream_end_completed");

        return {
          body: {
            ok: true,
            status: "COMPLETED",
            questionsAsked: countQuestionsFromTranscript(existingTranscript),
          },
          status: 200,
        };
      });

      // The text client expects a streaming response for its UI. When
      // finalization succeeded, emit the closing message. When it
      // couldn't complete (202 / 4xx / 5xx), emit a plain JSON error
      // so the client can show the correct state.
      if (idemResult.status !== 200) {
        return Response.json(idemResult.body, { status: idemResult.status });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const closing =
            "Thank you for completing this interview. Your assessment is being generated and will be available shortly. We appreciate your time!";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", content: closing })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", questionsAsked: countQuestionsFromTranscript(existingTranscript), ended: true })}\n\n`
            )
          );
          controller.close();
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

    // Start interview — set status to IN_PROGRESS
    if (action === "start" && interview.status === "PENDING") {
      // P0.4: Block interview start unless consent is confirmed in DB (parity with voice route)
      if (!interview.isPractice) {
        const preStartCheck = await prisma.interview.findUnique({
          where: { id },
          select: { consentRecording: true, consentProctoring: true, consentPrivacy: true, consentedAt: true, readinessVerified: true },
        });
        if (!preStartCheck?.consentRecording || !preStartCheck?.consentPrivacy || !preStartCheck?.consentedAt) {
          return new Response(
            JSON.stringify({ error: "Recording and privacy consent must be confirmed before starting the interview. Please complete the consent step." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        // Validate consent freshness — consent must be given within last 24 hours
        const consentAge = Date.now() - new Date(preStartCheck.consentedAt).getTime();
        const MAX_CONSENT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
        if (consentAge > MAX_CONSENT_AGE_MS) {
          return new Response(
            JSON.stringify({ error: "Your consent has expired. Please refresh the page and re-confirm consent before starting." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        // Proctoring consent is required for non-practice interviews
        if (!preStartCheck?.consentProctoring) {
          return new Response(
            JSON.stringify({ error: "Proctoring consent must be confirmed before starting the interview." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        // Template-driven readiness check enforcement
        const readinessRequired = interview.template?.readinessCheckRequired ?? false;
        if (readinessRequired && !preStartCheck.readinessVerified) {
          return new Response(
            JSON.stringify({ error: "Device readiness check must be completed before starting the interview." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      await prisma.interview.update({
        where: { id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });

      // Audit log: stream started
      logInterviewActivity({
        interviewId: id,
        action: "interview.stream_started",
        userId: interview.candidate.id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});
    }

    // Build Gemini chat
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    let systemPrompt = buildAriaSystemPrompt({
      interviewType: interview.type as any,
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      candidateCompany: interview.candidate.currentCompany,
      candidateSkills: Array.isArray(interview.candidate.skills)
        ? (interview.candidate.skills as string[])
        : [],
      candidateExperience: interview.candidate.experienceYears,
      resumeText: interview.candidate.resumeText,
    });

    // Inject interview plan context if available
    if (interview.interviewPlan) {
      const planContext = planToSystemContext(interview.interviewPlan as any);
      systemPrompt = `${systemPrompt}\n\n${planContext}`;
    }

    // Build chat history from existing transcript
    const history = existingTranscript.map((entry) => ({
      role: entry.role === "interviewer" ? ("model" as const) : ("user" as const),
      parts: [{ text: entry.content }],
    }));

    const chat = model.startChat({
      history,
      systemInstruction: systemPrompt,
    });

    // Determine the message to send
    const userMessage =
      action === "start"
        ? "Please begin the interview."
        : message;

    // Stream the response
    const result = await chat.sendMessageStream(userMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";

        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            fullResponse += text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`
              )
            );
          }

          // Build updated transcript
          const newEntries: TranscriptEntry[] = [];
          if (action === "respond" && message) {
            newEntries.push({
              role: "candidate",
              content: message,
              timestamp: new Date().toISOString(),
              mediaOffsetMs: interview.startedAt ? Date.now() - new Date(interview.startedAt).getTime() : 0,
            });
          }
          newEntries.push({
            role: "interviewer",
            content: fullResponse,
            timestamp: new Date().toISOString(),
            mediaOffsetMs: interview.startedAt ? Date.now() - new Date(interview.startedAt).getTime() : 0,
          });

          const updatedTranscript = [...existingTranscript, ...newEntries];

          // Save to database
          await prisma.interview.update({
            where: { id },
            data: { transcript: updatedTranscript as any },
          });

          const questionsAsked = countQuestionsFromTranscript(updatedTranscript);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", questionsAsked })}\n\n`
            )
          );
        } catch (streamError) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`
            )
          );
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Interview stream error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

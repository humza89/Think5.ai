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

    // Handle end action
    if (action === "end") {
      await prisma.interview.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          ...(integrityEvents ? { integrityEvents } : {}),
        },
      });

      // Audit log: stream ended
      logInterviewActivity({
        interviewId: id,
        action: "interview.stream_ended",
        userId: interview.candidate.id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      // Generate report via durable Inngest queue (with in-process fallback)
      inngest
        .send({ name: "interview/completed", data: { interviewId: id } })
        .catch((err: unknown) => {
          console.error("Inngest dispatch failed, falling back to in-process:", err);
          generateReportInBackground(id).catch(console.error);
        });

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

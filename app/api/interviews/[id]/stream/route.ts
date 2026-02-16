import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import {
  buildAriaSystemPrompt,
  countQuestionsFromTranscript,
} from "@/lib/aria-prompts";
import { generateReportInBackground } from "@/lib/report-generator";

interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
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
        },
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

      // Fire-and-forget report generation
      generateReportInBackground(id).catch((err) =>
        console.error("Background report generation failed:", err)
      );

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
      await prisma.interview.update({
        where: { id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    // Build Gemini chat
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const systemPrompt = buildAriaSystemPrompt({
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
            });
          }
          newEntries.push({
            role: "interviewer",
            content: fullResponse,
            timestamp: new Date().toISOString(),
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

/**
 * Durable Job: Update Aria Memory Graph
 *
 * Triggered periodically during an interview to extract semantic facts
 * from the transcript and build a structured knowledge graph for Rehydration.
 */

import { inngest } from "../client";
import { GoogleGenerativeAI } from "@google/generative-ai";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const updateAriaMemoryGraph = inngest.createFunction(
  {
    id: "interview/memory.update",
    retries: 3,
    triggers: [{ event: "interview/transcript_updated" }],
  },
  async ({ event, step }: any) => {
    const { interviewId } = event.data;

    const graph = await step.run("generate-knowledge-graph", async () => {
      const { prisma } = await import("@/lib/prisma");
      
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        select: { id: true, transcript: true, knowledgeGraph: true },
      });

      if (!interview || !Array.isArray(interview.transcript) || interview.transcript.length < 5) {
        return { skip: true, reason: "Not enough transcript data yet" };
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const currentGraph = typeof interview.knowledgeGraph === "object" ? JSON.stringify(interview.knowledgeGraph) : "{}";
      const transcriptText = interview.transcript
        .map((t: any) => `${t.role.toUpperCase()}: ${t.content}`)
        .join("\n\n");

      const prompt = `
You are maintaining the internal memory graph of an AI Interviewer (named Aria).
Below is the existing knowledge graph you have about the candidate, followed by the latest chronological interview transcript.

EXISTING KNOWLEDGE GRAPH:
${currentGraph}

RECENT TRANSCRIPT:
${transcriptText}

INSTRUCTIONS:
Extract factual claims, technical assertions, behavioral signals, conceptual answers, and timeline context from the transcript.
Merge these insights into the Knowledge Graph. Return ONLY the updated JSON Knowledge Graph. 
Ensure the JSON has these top-level keys:
- "verified_claims": Array of strings (e.g. "Candidate built a microservice architecture in 2023")
- "behavioral_signals": Array of strings (e.g. "Candidate demonstrates high agency when blocked")
- "technical_stack": Array of strings (e.g. "React, Node.js, Postgres")
- "timeline": Array of objects { year, event }
- "notable_quotes": Array of strings (direct conceptually strong quotes)
`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      try {
        const parsedContext = JSON.parse(responseText);
        
        // Save the updated graph back to Postgres
        await prisma.interview.update({
          where: { id: interviewId },
          data: { knowledgeGraph: parsedContext, knowledgeGraphUpdatedAt: new Date() },
        });
        
        return { success: true, keysFound: Object.keys(parsedContext) };
      } catch (err) {
        throw new Error("Failed to parse LLM memory graph response into JSON: " + err);
      }
    });

    return { interviewId, graph };
  }
);

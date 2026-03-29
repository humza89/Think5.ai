/**
 * Gemini Live API Client
 *
 * Wraps Google's Gemini Live API for real-time bidirectional voice interviews.
 * Handles WebSocket session management, audio streaming, function calling for
 * adaptive interview behavior, and transcript extraction.
 *
 * Audio format: PCM 16-bit, 24kHz mono (Gemini's expected input/output format)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Types ──────────────────────────────────────────────────────────────

export interface GeminiLiveConfig {
  systemInstruction: string;
  voiceName?: string; // "Puck", "Charon", "Kore", "Fenrir", "Aoede"
  tools?: GeminiLiveTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseModalities?: string[];
  };
}

export interface GeminiLiveTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiLiveSession {
  ws: WebSocket | null;
  sessionId: string;
  isActive: boolean;
  transcript: TranscriptEntry[];
}

export interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
}

export interface GeminiLiveCallbacks {
  onAudio: (audioChunk: string) => void; // base64 PCM audio
  onText: (text: string, role: "interviewer" | "candidate") => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

// ── Gemini Live Session Manager ────────────────────────────────────────

const GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export function createGeminiLiveSession(
  config: GeminiLiveConfig,
  callbacks: GeminiLiveCallbacks
): GeminiLiveSession {
  const session: GeminiLiveSession = {
    ws: null,
    sessionId: crypto.randomUUID(),
    isActive: false,
    transcript: [],
  };

  return session;
}

/**
 * Connect to Gemini Live API via WebSocket.
 * Returns a promise that resolves when the session is established.
 */
export async function connectGeminiLive(
  session: GeminiLiveSession,
  config: GeminiLiveConfig,
  callbacks: GeminiLiveCallbacks
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const wsUrl = `${GEMINI_LIVE_WS_URL}?key=${apiKey}`;

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    ws.onopen = () => {
      // Send setup message with model configuration
      const setupMessage = buildSetupMessage(config);
      ws.send(JSON.stringify(setupMessage));
      session.isActive = true;
      resolve();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
        handleServerMessage(data, session, callbacks);
      } catch (err) {
        callbacks.onError(new Error(`Failed to parse server message: ${err}`));
      }
    };

    ws.onerror = (event: Event) => {
      const error = new Error("WebSocket error");
      callbacks.onError(error);
      if (!session.isActive) reject(error);
    };

    ws.onclose = () => {
      session.isActive = false;
      callbacks.onClose();
    };
  });
}

/**
 * Send candidate audio to Gemini Live.
 * Audio should be base64-encoded PCM 16-bit, 24kHz mono.
 */
export function sendAudio(session: GeminiLiveSession, audioBase64: string): void {
  if (!session.ws || !session.isActive) return;

  const message = {
    realtimeInput: {
      mediaChunks: [
        {
          mimeType: "audio/pcm;rate=24000",
          data: audioBase64,
        },
      ],
    },
  };

  session.ws.send(JSON.stringify(message));
}

/**
 * Send text message to Gemini Live (for text fallback mode).
 */
export function sendText(session: GeminiLiveSession, text: string): void {
  if (!session.ws || !session.isActive) return;

  const message = {
    clientContent: {
      turns: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    },
  };

  session.ws.send(JSON.stringify(message));

  // Add to transcript
  session.transcript.push({
    role: "candidate",
    content: text,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send tool response back to Gemini after processing a function call.
 */
export function sendToolResponse(
  session: GeminiLiveSession,
  functionCallId: string,
  result: Record<string, unknown>
): void {
  if (!session.ws || !session.isActive) return;

  const message = {
    toolResponse: {
      functionResponses: [
        {
          id: functionCallId,
          name: functionCallId,
          response: result,
        },
      ],
    },
  };

  session.ws.send(JSON.stringify(message));
}

/**
 * Gracefully close the session.
 */
export function closeSession(session: GeminiLiveSession): void {
  if (session.ws) {
    session.isActive = false;
    session.ws.close();
    session.ws = null;
  }
}

// ── Internal Helpers ───────────────────────────────────────────────────

function buildSetupMessage(config: GeminiLiveConfig) {
  const functionDeclarations = config.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  const setup: Record<string, unknown> = {
    model: "models/gemini-2.5-flash-native-audio-latest",
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: config.voiceName || "Kore",
          },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: config.systemInstruction }],
    },
  };

  if (functionDeclarations && functionDeclarations.length > 0) {
    setup.tools = [{ functionDeclarations }];
  }

  return { setup };
}

function handleServerMessage(
  data: Record<string, unknown>,
  session: GeminiLiveSession,
  callbacks: GeminiLiveCallbacks
): void {
  // Setup complete acknowledgement
  if (data.setupComplete) {
    return;
  }

  // Server content (audio + text responses)
  const serverContent = data.serverContent as Record<string, unknown> | undefined;
  if (serverContent) {
    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
    if (modelTurn) {
      const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
      if (parts) {
        for (const part of parts) {
          // Audio response
          const inlineData = part.inlineData as Record<string, unknown> | undefined;
          if (inlineData?.data) {
            callbacks.onAudio(inlineData.data as string);
          }

          // Text response (transcript of what AI said)
          if (part.text) {
            const text = part.text as string;
            callbacks.onText(text, "interviewer");
            session.transcript.push({
              role: "interviewer",
              content: text,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Turn complete
    if (serverContent.turnComplete) {
      callbacks.onTurnComplete();
    }

    // Interrupted (candidate started speaking while AI was talking)
    if (serverContent.interrupted) {
      callbacks.onInterrupted();
    }
  }

  // Tool calls (for adaptive difficulty, section changes, etc.)
  const toolCall = data.toolCall as Record<string, unknown> | undefined;
  if (toolCall) {
    const functionCalls = toolCall.functionCalls as Array<Record<string, unknown>> | undefined;
    if (functionCalls) {
      for (const fc of functionCalls) {
        callbacks.onToolCall(
          fc.name as string,
          (fc.args as Record<string, unknown>) || {}
        );
      }
    }
  }
}

// ── Interview-Specific Tools ───────────────────────────────────────────

/**
 * Define the function calling tools for adaptive interview behavior.
 * These are registered with Gemini and called during the interview.
 */
export function getInterviewTools(): GeminiLiveTool[] {
  return [
    {
      name: "adjustDifficulty",
      description:
        "Adjust the difficulty level of questions based on candidate performance. Call this when the candidate demonstrates strong or weak understanding of a topic.",
      parameters: {
        type: "object",
        properties: {
          currentLevel: {
            type: "string",
            enum: ["junior", "mid", "senior", "staff"],
            description: "The current difficulty level",
          },
          newLevel: {
            type: "string",
            enum: ["junior", "mid", "senior", "staff"],
            description: "The recommended new difficulty level",
          },
          reason: {
            type: "string",
            description: "Brief explanation of why difficulty is being adjusted",
          },
        },
        required: ["currentLevel", "newLevel", "reason"],
      },
    },
    {
      name: "moveToNextSection",
      description:
        "Move to the next skill module section of the interview. Call this when the current section is sufficiently covered or the candidate is struggling.",
      parameters: {
        type: "object",
        properties: {
          currentSection: {
            type: "string",
            description: "Name of the current skill module being assessed",
          },
          nextSection: {
            type: "string",
            description: "Name of the next skill module to assess",
          },
          reason: {
            type: "string",
            enum: ["mastery_demonstrated", "sufficient_coverage", "candidate_struggling", "time_constraint", "candidate_request", "topic_exhausted"],
            description: "Reason for moving to the next section. Use exactly one of: mastery_demonstrated, sufficient_coverage, candidate_struggling, time_constraint, candidate_request, topic_exhausted",
          },
          sectionScore: {
            type: "number",
            description: "Estimated score for the completed section (0-10)",
          },
          sectionNotes: {
            type: "string",
            description:
              "Brief qualitative assessment of candidate's performance in this section (e.g., 'Strong on distributed systems, weak on CAP theorem trade-offs'). Include specific evidence.",
          },
        },
        required: ["currentSection", "nextSection", "reason"],
      },
    },
    {
      name: "flagForFollowUp",
      description:
        "Flag an interesting topic or claim for deeper follow-up questioning.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "The topic or claim to follow up on",
          },
          reason: {
            type: "string",
            description: "Why this warrants deeper investigation",
          },
          depth: {
            type: "string",
            enum: ["surface", "moderate", "deep"],
            description: "How deep the follow-up should go",
          },
        },
        required: ["topic", "reason"],
      },
    },
    {
      name: "updateCandidateProfile",
      description:
        "Update the running assessment of the candidate's profile. Call this after each section transition or when you observe a significant strength, weakness, or communication pattern. This data persists across reconnects. IMPORTANT: This tool merges with prior calls — only include NEW strengths/weaknesses discovered in this section. Previously reported items are retained automatically.",
      parameters: {
        type: "object",
        properties: {
          strengths: {
            type: "array",
            items: { type: "string" },
            description: "Demonstrated strengths (e.g., 'strong system design fundamentals', 'clear communication')",
          },
          weaknesses: {
            type: "array",
            items: { type: "string" },
            description: "Areas of weakness (e.g., 'vague on metrics', 'shallow on concurrency')",
          },
          communicationStyle: {
            type: "string",
            description: "Observed communication style: concise, verbose, structured, rambling, technical, conversational",
          },
          confidenceLevel: {
            type: "string",
            enum: ["low", "moderate", "high"],
            description: "Overall confidence level observed in candidate's responses",
          },
          notableObservations: {
            type: "string",
            description: "Any other notable observations about the candidate's approach or behavior",
          },
        },
        required: ["strengths", "weaknesses"],
      },
    },
    {
      name: "endInterview",
      description:
        "Gracefully end the interview. Call this when all sections are covered or time is running out.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["all_sections_covered", "time_limit", "candidate_request", "technical_issue"],
            description: "Reason for ending the interview",
          },
          closingMessage: {
            type: "string",
            description: "Brief closing message to deliver to the candidate",
          },
        },
        required: ["reason"],
      },
    },
  ];
}

// ── Fallback: Text-based Gemini for non-voice interviews ───────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Generate an interview plan using standard Gemini API (not live).
 * Used before the voice session starts to create the adaptive plan.
 */
export async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 4096,
    },
  });

  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

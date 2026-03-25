"use client";

/**
 * useVoiceInterview — Client-side Gemini Live WebSocket
 *
 * Connects directly to Gemini Live API from the browser.
 * No server relay — audio streams bidirectionally over WebSocket.
 * Server is only used for initialization (system prompt) and persistence
 * (transcript checkpoints, interview end).
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────

export type InterviewState =
  | "IDLE"
  | "CONNECTING"
  | "READY"
  | "IN_PROGRESS"
  | "WRAPPING_UP"
  | "COMPLETED"
  | "ERROR";

export type AISpeakingState = "idle" | "listening" | "thinking" | "speaking";

export interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
  finalized?: boolean; // true when turn is complete (used to accumulate fragments)
}

export interface VoiceInterviewConfig {
  interviewId: string;
  accessToken: string;
  onStateChange?: (state: InterviewState) => void;
  onTranscriptUpdate?: (transcript: TranscriptEntry[]) => void;
  onError?: (error: string) => void;
  onInterviewEnd?: () => void;
}

export interface UseVoiceInterviewReturn {
  interviewState: InterviewState;
  aiState: AISpeakingState;
  transcript: TranscriptEntry[];
  isConnected: boolean;
  questionCount: number;
  connectionQuality: "good" | "fair" | "poor";
  isReconnecting: boolean;
  isPaused: boolean;
  fallbackToText: boolean;
  reconnectPhase: "checking" | "restoring" | "verifying" | null;
  micIsSilent: boolean;
  startInterview: () => Promise<void>;
  endInterview: () => void;
  sendTextMessage: (text: string) => void;
  toggleMic: () => void;
  isMicEnabled: boolean;
  reconnect: () => Promise<void>;
  pauseInterview: () => Promise<void>;
  resumeInterview: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────

const GEMINI_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const CHECKPOINT_INTERVAL_MS = 30_000; // Save transcript every 30s

// ── Hook ───────────────────────────────────────────────────────────────

export function useVoiceInterview(
  config: VoiceInterviewConfig
): UseVoiceInterviewReturn {
  const { interviewId, accessToken, onStateChange, onTranscriptUpdate, onError, onInterviewEnd } = config;

  // State
  const [interviewState, setInterviewState] = useState<InterviewState>("IDLE");
  const [aiState, setAiState] = useState<AISpeakingState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor">("good");
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [fallbackToText, setFallbackToText] = useState(false);
  const [reconnectPhase, setReconnectPhase] = useState<"checking" | "restoring" | "verifying" | null>(null);
  const [micIsSilent, setMicIsSilent] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0); // Tracks when the next audio chunk should start
  const isMicEnabledRef = useRef(true);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const moduleScoresRef = useRef<Array<{ module: string; score: number; reason: string }>>([]);
  const checkpointTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionCountRef = useRef(0);
  const candidateNameRef = useRef("");
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const intentionalCloseRef = useRef(false); // True when we close the WS ourselves
  const currentTurnTextRef = useRef(""); // Accumulates interviewer transcript fragments within a turn
  const currentCandidateTextRef = useRef(""); // Accumulates candidate speech transcription

  // Enterprise resilience refs
  const isStartingRef = useRef(false); // Mutex: prevents concurrent startInterview() calls
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef(Date.now()); // Tracks last message from Gemini
  const qualityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const droppedFramesRef = useRef(0); // Consecutive frames dropped due to backpressure
  const silentFramesRef = useRef(0); // Consecutive silent audio frames
  const checkpointFailuresRef = useRef(0); // Consecutive checkpoint failures
  const consecutiveSetupFailuresRef = useRef(0); // Circuit breaker counter

  // ── Audio Resource Cleanup Helper ────────────────────────────────────
  // Called before reconnect and on unmount to prevent resource leaks
  const cleanupAudioResources = useCallback(() => {
    // 1. Disconnect and destroy ScriptProcessorNode
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch { /* already disconnected */ }
      processorRef.current = null;
    }

    // 2. Close AudioContext (stops all scheduled playback)
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch { /* already closed */ }
      audioContextRef.current = null;
    }

    // 3. Reset playback timing so new context starts fresh
    nextPlayTimeRef.current = 0;

    // 4. Reset turn text accumulators
    currentTurnTextRef.current = "";
    currentCandidateTextRef.current = "";

    // 5. Clear heartbeat and quality monitoring intervals
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
      qualityCheckIntervalRef.current = null;
    }

    // 6. Reset monitoring counters
    droppedFramesRef.current = 0;
    silentFramesRef.current = 0;
    setMicIsSilent(false);
  }, []);

  // Keep refs in sync
  useEffect(() => { isMicEnabledRef.current = isMicEnabled; }, [isMicEnabled]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);

  // Notify parent on state changes
  useEffect(() => { onStateChange?.(interviewState); }, [interviewState, onStateChange]);
  useEffect(() => { onTranscriptUpdate?.(transcript); }, [transcript, onTranscriptUpdate]);

  // Auto-stop mic when falling back to text mode
  useEffect(() => {
    if (fallbackToText) {
      cleanupAudioResources();
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    }
  }, [fallbackToText, cleanupAudioResources]);

  // ── Audio Playback (gapless scheduled) ──────────────────────────

  const scheduleAudioChunk = useCallback((audioData: Float32Array) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const buffer = ctx.createBuffer(1, audioData.length, 24000);
    buffer.copyToChannel(new Float32Array(audioData), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Schedule gaplessly: each chunk starts exactly when the previous ends
    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    // Track when AI finishes speaking
    source.onended = () => {
      if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
        setAiState("listening");
      }
    };
  }, []);

  // ── Gemini WebSocket Message Handler ───────────────────────────────

  const handleGeminiMessage = useCallback(async (event: MessageEvent) => {
    try {
      let text: string;
      if (typeof event.data === "string") {
        text = event.data;
      } else if (event.data instanceof Blob) {
        text = await event.data.text();
      } else {
        return; // Skip unknown data types
      }
      const data = JSON.parse(text);

      // Setup complete
      if (data.setupComplete) {
        return;
      }

      // Server content (audio + text)
      const serverContent = data.serverContent as Record<string, unknown> | undefined;
      if (serverContent) {
        // Input transcription (candidate's speech → text)
        const inputTranscription = serverContent.inputTranscription as Record<string, unknown> | undefined;
        if (inputTranscription?.text) {
          const fragment = inputTranscription.text as string;
          currentCandidateTextRef.current += fragment;
          // Update transcript with accumulated candidate text (single entry per turn)
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "candidate" && !last.finalized) {
              return [...prev.slice(0, -1), { ...last, content: currentCandidateTextRef.current }];
            }
            return [...prev, { role: "candidate" as const, content: currentCandidateTextRef.current, timestamp: new Date().toISOString() }];
          });
        }

        const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
        if (modelTurn) {
          // Finalize any pending candidate text when the model starts responding
          if (currentCandidateTextRef.current.trim()) {
            const candidateText = currentCandidateTextRef.current.trim();
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "candidate") {
                return [...prev.slice(0, -1), { ...last, content: candidateText, finalized: true }];
              }
              return prev;
            });
            currentCandidateTextRef.current = "";
          }
          const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            for (const part of parts) {
              // Audio
              const inlineData = part.inlineData as Record<string, unknown> | undefined;
              if (inlineData?.data) {
                setAiState("speaking");
                const audioData = base64ToFloat32(inlineData.data as string);
                scheduleAudioChunk(audioData);
              }

              // Text transcript — accumulate into current turn (modelTurn text is rare for native audio)
              if (part.text) {
                const fragment = part.text as string;
                // Filter out Gemini's internal thinking/reasoning
                if (fragment.startsWith("*") || fragment.startsWith("**")) continue;
                currentTurnTextRef.current += fragment;
              }
            }
          }
        }

        // Output transcription (native audio models send transcript word-by-word here)
        const outputTranscription = serverContent.outputTranscription as Record<string, unknown> | undefined;
        if (outputTranscription?.text) {
          const fragment = outputTranscription.text as string;
          // Filter out Gemini's internal thinking/reasoning
          if (!fragment.startsWith("*")) {
            currentTurnTextRef.current += fragment;
            // Update transcript with accumulated text (single entry per turn)
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "interviewer" && !last.finalized) {
                // Update existing in-progress entry
                return [...prev.slice(0, -1), { ...last, content: currentTurnTextRef.current }];
              }
              // Create new in-progress entry
              return [...prev, { role: "interviewer" as const, content: currentTurnTextRef.current, timestamp: new Date().toISOString() }];
            });
          }
        }

        // Turn complete — finalize the accumulated transcript entry
        if (serverContent.turnComplete) {
          if (currentTurnTextRef.current.trim()) {
            const finalText = currentTurnTextRef.current.trim();
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "interviewer") {
                return [...prev.slice(0, -1), { ...last, content: finalText, finalized: true }];
              }
              return [...prev, { role: "interviewer" as const, content: finalText, timestamp: new Date().toISOString(), finalized: true }];
            });
            // Count questions from the complete sentence
            if (finalText.includes("?")) {
              setQuestionCount((prev) => prev + 1);
            }
          }
          currentTurnTextRef.current = "";
          setAiState("listening");
        }

        // Interrupted — reset scheduled playback time so new audio starts immediately
        if (serverContent.interrupted) {
          nextPlayTimeRef.current = 0;
          currentTurnTextRef.current = "";
        }
      }

      // Tool calls
      const toolCall = data.toolCall as Record<string, unknown> | undefined;
      if (toolCall) {
        const functionCalls = toolCall.functionCalls as Array<Record<string, unknown>> | undefined;
        if (functionCalls) {
          for (const fc of functionCalls) {
            handleToolCall(fc.name as string, fc.id as string, (fc.args as Record<string, unknown>) || {});
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse Gemini message:", err);
    }
  }, [scheduleAudioChunk]);

  // ── Tool Call Handler (client-side) ────────────────────────────────

  const handleToolCall = useCallback((name: string, callId: string, args: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send acknowledgment back to Gemini
    const sendResponse = (response: Record<string, unknown>) => {
      ws.send(JSON.stringify({
        toolResponse: {
          functionResponses: [{
            id: callId,
            name,
            response,
          }],
        },
      }));
    };

    switch (name) {
      case "adjustDifficulty":
        console.log(`[Voice] Difficulty: ${args.currentLevel} → ${args.newLevel}`);
        sendResponse({ acknowledged: true });
        break;

      case "moveToNextSection":
        console.log(`[Voice] Section: ${args.currentSection} → ${args.nextSection}`);
        if (args.sectionScore !== undefined) {
          moduleScoresRef.current.push({
            module: args.currentSection as string,
            score: args.sectionScore as number,
            reason: args.reason as string,
          });
        }
        sendResponse({ acknowledged: true });
        break;

      case "flagForFollowUp":
        console.log(`[Voice] Follow-up: ${args.topic}`);
        sendResponse({ acknowledged: true });
        break;

      case "endInterview":
        console.log(`[Voice] End interview: ${args.reason}`);
        sendResponse({ acknowledged: true });
        // Wait for closing message, then end
        setTimeout(() => {
          endInterviewInternal();
        }, 5000);
        break;
    }
  }, []);

  // ── Checkpoint Transcript ──────────────────────────────────────────

  const checkpointTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews/${interviewId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          action: "checkpoint",
          transcript: transcriptRef.current,
          moduleScores: moduleScoresRef.current,
          questionCount: questionCountRef.current,
        }),
      });
      if (res.ok) {
        checkpointFailuresRef.current = 0;
      } else {
        throw new Error(`Checkpoint HTTP ${res.status}`);
      }
    } catch {
      checkpointFailuresRef.current += 1;
      if (checkpointFailuresRef.current >= 3) {
        console.warn("[Voice] 3+ consecutive checkpoint failures — progress may not be saving");
        onError?.("Progress may not be saving — check your connection.");
      }
    }
  }, [interviewId, accessToken, onError]);

  // ── End Interview (internal) ───────────────────────────────────────

  const endInterviewInternal = useCallback(async () => {
    setInterviewState("WRAPPING_UP");

    // Flush any pending transcript fragments before saving
    if (currentTurnTextRef.current.trim()) {
      const finalText = currentTurnTextRef.current.trim();
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "interviewer" && !last.finalized) {
          return [...prev.slice(0, -1), { ...last, content: finalText, finalized: true }];
        }
        return [...prev, { role: "interviewer" as const, content: finalText, timestamp: new Date().toISOString(), finalized: true }];
      });
      currentTurnTextRef.current = "";
    }
    if (currentCandidateTextRef.current.trim()) {
      const candidateText = currentCandidateTextRef.current.trim();
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "candidate" && !last.finalized) {
          return [...prev.slice(0, -1), { ...last, content: candidateText, finalized: true }];
        }
        return [...prev, { role: "candidate" as const, content: candidateText, timestamp: new Date().toISOString(), finalized: true }];
      });
      currentCandidateTextRef.current = "";
    }

    // Clean up all audio resources
    cleanupAudioResources();

    // Close WebSocket (intentional)
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    // Stop mic tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Stop checkpoint timer
    if (checkpointTimerRef.current) {
      clearInterval(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }

    // Save final state to server
    try {
      await fetch(`/api/interviews/${interviewId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          action: "end_interview",
          transcript: transcriptRef.current,
          moduleScores: moduleScoresRef.current,
          questionCount: questionCountRef.current,
        }),
      });
    } catch (err) {
      console.error("Failed to save interview end:", err);
    }

    setInterviewState("COMPLETED");
    onInterviewEnd?.();
  }, [interviewId, accessToken, onInterviewEnd, cleanupAudioResources]);

  // ── Start Interview ────────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    // Mutex: prevent concurrent startInterview() calls
    if (isStartingRef.current) {
      console.warn("[Voice] startInterview() already in progress — skipping");
      return;
    }
    isStartingRef.current = true;

    try {
      intentionalCloseRef.current = false;
      setInterviewState("CONNECTING");

      // 0. Clean up old audio resources (critical for reconnect)
      cleanupAudioResources();
      // Close old WebSocket if still open
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      // Clear old checkpoint timer to avoid duplicates
      if (checkpointTimerRef.current) {
        clearInterval(checkpointTimerRef.current);
        checkpointTimerRef.current = null;
      }

      // Circuit breaker: if 3+ consecutive setup failures, stop retrying
      if (consecutiveSetupFailuresRef.current >= 3) {
        console.error("[Voice] Circuit breaker tripped — 3 consecutive setup failures");
        setFallbackToText(true);
        onError?.("Voice connection failed repeatedly. Switching to text mode.");
        return;
      }

      // 1. Get config from server
      const initRes = await fetch(`/api/interviews/${interviewId}/voice-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });

      if (!initRes.ok) {
        consecutiveSetupFailuresRef.current += 1;
        const err = await initRes.json().catch(() => ({ error: "Init failed" }));
        // Permanent failures — don't retry
        if (initRes.status === 403) {
          consecutiveSetupFailuresRef.current = 3; // Trip circuit breaker immediately
          throw new Error("API authorization failed. Check your API key.");
        }
        if (initRes.status === 429) {
          throw new Error("Rate limited — please wait a moment and try again.");
        }
        throw new Error(err.error || `Init error: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { apiKey, systemPrompt, tools, voiceName, candidateName, model } = initData;
      candidateNameRef.current = candidateName;

      // 2. Set up audio context for playback
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      nextPlayTimeRef.current = 0; // Fresh timing for new context

      // 3. Reuse existing mic stream if tracks are still active, else request new
      let micStream: MediaStream;
      const existingStream = mediaStreamRef.current;
      const hasActiveTracks = existingStream?.getAudioTracks().some((t) => t.readyState === "live");
      if (existingStream && hasActiveTracks) {
        console.log("[Voice] Reusing existing mic stream");
        micStream = existingStream;
        // Re-enable tracks in case they were disabled
        micStream.getAudioTracks().forEach((t) => (t.enabled = true));
      } else {
        console.log("[Voice] Requesting new mic stream");
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 24000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = micStream;
      }

      // 4. Connect to Gemini Live WebSocket and wait for setupComplete
      const wsUrl = `${GEMINI_WS_URL}?key=${apiKey}`;
      console.log("[Voice] Connecting to Gemini Live...");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error("[Voice] Setup timeout — no setupComplete received");
          reject(new Error("WebSocket setup timeout"));
        }, 15000);

        ws.onopen = () => {
          console.log("[Voice] WebSocket connected, sending setup message...");

          // Build tool declarations — single object wrapping all declarations
          const functionDeclarations = tools.map((tool: { name: string; description: string; parameters: Record<string, unknown> }) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          }));

          const setupMsg: Record<string, unknown> = {
            setup: {
              model: model || "models/gemini-2.5-flash-native-audio-latest",
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
                  },
                },
              },
              systemInstruction: {
                parts: [{ text: systemPrompt }],
              },
              outputAudioTranscription: {},
              inputAudioTranscription: {},
            },
          };

          // Only add tools if they exist
          if (functionDeclarations.length > 0) {
            (setupMsg.setup as Record<string, unknown>).tools = [{ functionDeclarations }];
          }

          console.log("[Voice] Setup model:", (setupMsg.setup as Record<string, unknown>).model);
          console.log("[Voice] Setup message:", JSON.stringify(setupMsg).slice(0, 500));
          ws.send(JSON.stringify(setupMsg));
        };

        ws.onmessage = async (event) => {
          try {
            let text: string;
            if (typeof event.data === "string") {
              text = event.data;
            } else if (event.data instanceof Blob) {
              text = await event.data.text();
            } else {
              text = "{}";
            }
            const data = JSON.parse(text);
            console.log("[Voice] Setup response:", JSON.stringify(data).slice(0, 200));
            if (data.setupComplete) {
              clearTimeout(timeout);
              console.log("[Voice] Setup complete — Gemini ready");
              resolve();
            }
          } catch (err) {
            console.error("[Voice] Failed to parse setup response:", err);
          }
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          console.error("[Voice] WebSocket error during setup:", event);
          reject(new Error("WebSocket connection failed"));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          console.error("[Voice] WebSocket closed during setup — code:", event.code, "reason:", event.reason);
          reject(new Error(`WebSocket closed during setup: code ${event.code} ${event.reason || "(no reason)"}`));
        };
      });

      // 5. Set up persistent message handler (replaces setup handler)
      ws.onmessage = (event) => {
        lastMessageTimeRef.current = Date.now(); // Track for heartbeat & quality metrics
        handleGeminiMessage(event);
      };

      ws.onerror = (event) => {
        console.error("[Voice] WebSocket error:", event);
        setConnectionQuality("poor");
      };

      ws.onclose = (event) => {
        console.log("[Voice] WebSocket closed — code:", event.code, "reason:", event.reason, "intentional:", intentionalCloseRef.current);
        setIsConnected(false);

        // Skip reconnect for intentional closes or permanent failures
        const permanentFailureCodes = [1007, 1008]; // invalid argument, model not found
        if (intentionalCloseRef.current || permanentFailureCodes.includes(event.code)) {
          intentionalCloseRef.current = false;
          if (permanentFailureCodes.includes(event.code)) {
            setConnectionQuality("poor");
            onError?.(`Connection failed permanently (code ${event.code}). Switch to text mode.`);
            setFallbackToText(true);
          }
          return;
        }

        // Auto-reconnect on any unexpected close (session timeout, network drop, etc.)
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const attempt = reconnectAttemptsRef.current;
          const base = 1000;
          const exp = Math.pow(2, attempt);
          const jitter = Math.random() * base; // Add jitter to prevent thundering herd
          const delay = Math.min(base * exp + jitter, 10000);
          console.log(`[Voice] Unexpected closure (code ${event.code}) — reconnecting in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`);
          reconnectAttemptsRef.current += 1;
          setIsReconnecting(true);
          setReconnectPhase("restoring");
          // Don't show "poor" quality during reconnect — it's expected
          setConnectionQuality("fair");
          setTimeout(() => {
            startInterview().then(() => {
              reconnectAttemptsRef.current = 0;
              setIsReconnecting(false);
              setReconnectPhase(null);
              setConnectionQuality("good");
            }).catch(() => {
              setIsReconnecting(false);
              setReconnectPhase(null);
              if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                setConnectionQuality("poor");
                setFallbackToText(true);
                onError?.("Connection lost. You can switch to text mode.");
              }
            });
          }, delay);
        } else {
          setConnectionQuality("poor");
          setFallbackToText(true);
          onError?.("Connection lost after multiple attempts. Switch to text mode.");
        }
      };

      // 6. Send greeting or restore context on reconnect
      const existingTranscript = transcriptRef.current;
      if (existingTranscript.length > 0) {
        // Reconnect: restore conversation context from last few exchanges
        console.log("[Voice] Reconnecting — restoring transcript context...");
        const recentEntries = existingTranscript.slice(-6); // Last 3 exchanges
        const contextTurns = recentEntries.map((entry) => ({
          role: entry.role === "interviewer" ? "model" : "user",
          parts: [{ text: entry.content }],
        }));
        ws.send(JSON.stringify({
          clientContent: {
            turns: [
              ...contextTurns,
              {
                role: "user",
                parts: [{ text: "Continue the interview seamlessly from where we left off. Do not re-introduce yourself or repeat any questions." }],
              },
            ],
            turnComplete: true,
          },
        }));
      } else {
        // First connect: send greeting trigger
        console.log("[Voice] Sending greeting trigger...");
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: "user",
              parts: [{ text: `Begin the interview now. Greet ${candidateName} warmly and introduce yourself as Aria, their AI interviewer.` }],
            }],
            turnComplete: true,
          },
        }));
      }

      // 7. Start mic audio capture → WebSocket
      const source = audioContext.createMediaStreamSource(micStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isMicEnabledRef.current) return;
        const ws2 = wsRef.current;
        if (!ws2 || ws2.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // ── Silence detection ──
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        if (rms < 0.005) {
          silentFramesRef.current += 1;
          if (silentFramesRef.current >= 30 && !micIsSilent) { // ~3s of silence
            setMicIsSilent(true);
          }
        } else {
          if (silentFramesRef.current >= 30) {
            setMicIsSilent(false);
          }
          silentFramesRef.current = 0;
        }

        // ── Backpressure: skip frame if WebSocket buffer is overloaded ──
        if (ws2.bufferedAmount > 100_000) { // 100KB threshold
          droppedFramesRef.current += 1;
          if (droppedFramesRef.current === 10) {
            setConnectionQuality("fair");
          } else if (droppedFramesRef.current === 50) {
            setConnectionQuality("poor");
            console.warn("[Voice] 50+ consecutive frames dropped — network severely congested");
          }
          return; // Drop this frame
        }
        droppedFramesRef.current = 0;

        const pcm16 = float32ToPCM16(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

        ws2.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=24000",
              data: base64,
            }],
          },
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // 8. Start checkpoint timer
      checkpointTimerRef.current = setInterval(checkpointTranscript, CHECKPOINT_INTERVAL_MS);

      // 9. Start heartbeat — detect dead connections proactively
      lastMessageTimeRef.current = Date.now();
      heartbeatIntervalRef.current = setInterval(() => {
        const ws2 = wsRef.current;
        if (!ws2 || ws2.readyState !== WebSocket.OPEN) return;

        const silenceMs = Date.now() - lastMessageTimeRef.current;
        if (silenceMs > 30_000) {
          // No message from Gemini for 30s — connection is dead
          console.warn("[Voice] Heartbeat timeout — no server message for 30s, triggering reconnect");
          intentionalCloseRef.current = false; // Let onclose trigger reconnect
          ws2.close(4000, "Heartbeat timeout");
        }
      }, 20_000); // Check every 20s

      // 10. Start connection quality monitoring
      qualityCheckIntervalRef.current = setInterval(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const gap = Date.now() - lastMessageTimeRef.current;
        if (gap < 2_000) {
          setConnectionQuality("good");
        } else if (gap < 5_000) {
          setConnectionQuality("fair");
        } else {
          setConnectionQuality("poor");
        }
      }, 5_000); // Check every 5s

      setInterviewState("IN_PROGRESS");
      setIsConnected(true);
      setAiState("thinking");
      setConnectionQuality("good");
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      consecutiveSetupFailuresRef.current = 0; // Reset circuit breaker
    } catch (err) {
      console.error("Failed to start voice interview:", err);
      consecutiveSetupFailuresRef.current += 1;
      setInterviewState("ERROR");
      onError?.(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      isStartingRef.current = false; // Release mutex
    }
  }, [interviewId, accessToken, handleGeminiMessage, checkpointTranscript, onError, cleanupAudioResources, micIsSilent]);

  // ── Public Actions ─────────────────────────────────────────────────

  const endInterview = useCallback(() => {
    endInterviewInternal();
  }, [endInterviewInternal]);

  const sendTextMessage = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      },
    }));

    setTranscript((prev) => [
      ...prev,
      { role: "candidate", content: text, timestamp: new Date().toISOString() },
    ]);
  }, []);

  const toggleMic = useCallback(() => {
    setIsMicEnabled((prev) => {
      const newState = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = newState;
        });
      }
      return newState;
    });
  }, []);

  const pauseInterview = useCallback(async () => {
    try {
      await fetch(`/api/interviews/${interviewId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", accessToken }),
      });
      setIsPaused(true);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      nextPlayTimeRef.current = 0; // Cancel pending scheduled audio
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to pause");
    }
  }, [interviewId, accessToken, onError]);

  const resumeInterview = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews/${interviewId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume", accessToken }),
      });
      const data = await res.json();
      if (data.status === "CANCELLED") {
        setInterviewState("ERROR");
        onError?.("Interview was cancelled due to exceeding pause time limit.");
        return;
      }
      setIsPaused(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = isMicEnabledRef.current));
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to resume");
    }
  }, [interviewId, accessToken, onError]);

  const reconnect = useCallback(async () => {
    setIsReconnecting(true);
    setReconnectPhase("checking");
    reconnectAttemptsRef.current = 0; // Reset on manual reconnect
    try {
      await startInterview();
      setIsReconnecting(false);
      setReconnectPhase(null);
    } catch {
      setIsReconnecting(false);
      setReconnectPhase(null);
      setFallbackToText(true);
      onError?.("Failed to reconnect. You can switch to text mode.");
    }
  }, [startInterview, onError]);

  // ── Cleanup ────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      if (checkpointTimerRef.current) {
        clearInterval(checkpointTimerRef.current);
        checkpointTimerRef.current = null;
      }
      // Stop mic tracks fully on unmount (not just on reconnect)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]);

  return {
    interviewState,
    aiState,
    transcript,
    isConnected,
    questionCount,
    connectionQuality,
    isReconnecting,
    isPaused,
    fallbackToText,
    reconnectPhase,
    micIsSilent,
    startInterview,
    endInterview,
    sendTextMessage,
    toggleMic,
    isMicEnabled,
    reconnect,
    pauseInterview,
    resumeInterview,
  };
}

// ── Audio Utility Functions ────────────────────────────────────────────

function float32ToPCM16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

function base64ToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

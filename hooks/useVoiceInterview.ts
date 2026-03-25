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

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const isMicEnabledRef = useRef(true);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const moduleScoresRef = useRef<Array<{ module: string; score: number; reason: string }>>([]);
  const checkpointTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionCountRef = useRef(0);
  const candidateNameRef = useRef("");
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Keep refs in sync
  useEffect(() => { isMicEnabledRef.current = isMicEnabled; }, [isMicEnabled]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);

  // Notify parent on state changes
  useEffect(() => { onStateChange?.(interviewState); }, [interviewState, onStateChange]);
  useEffect(() => { onTranscriptUpdate?.(transcript); }, [transcript, onTranscriptUpdate]);

  // ── Audio Playback ───────────────────────────────────────────────

  const processPlaybackQueue = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) return;
    if (!audioContextRef.current) return;

    isPlayingRef.current = true;
    const data = playbackQueueRef.current.shift()!;

    const buffer = audioContextRef.current.createBuffer(1, data.length, 24000);
    buffer.copyToChannel(new Float32Array(data), 0);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    source.onended = () => {
      isPlayingRef.current = false;
      if (playbackQueueRef.current.length > 0) {
        processPlaybackQueue();
      } else {
        setAiState("listening");
      }
    };

    source.start();
  }, []);

  // ── Gemini WebSocket Message Handler ───────────────────────────────

  const handleGeminiMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");

      // Setup complete
      if (data.setupComplete) {
        return;
      }

      // Server content (audio + text)
      const serverContent = data.serverContent as Record<string, unknown> | undefined;
      if (serverContent) {
        const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
        if (modelTurn) {
          const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            for (const part of parts) {
              // Audio
              const inlineData = part.inlineData as Record<string, unknown> | undefined;
              if (inlineData?.data) {
                setAiState("speaking");
                const audioData = base64ToFloat32(inlineData.data as string);
                playbackQueueRef.current.push(audioData);
                processPlaybackQueue();
              }

              // Text transcript
              if (part.text) {
                const text = part.text as string;
                const entry: TranscriptEntry = {
                  role: "interviewer",
                  content: text,
                  timestamp: new Date().toISOString(),
                };
                setTranscript((prev) => [...prev, entry]);
                // Count questions
                if (text.includes("?")) {
                  setQuestionCount((prev) => prev + 1);
                }
              }
            }
          }
        }

        // Turn complete
        if (serverContent.turnComplete) {
          setAiState("listening");
        }

        // Interrupted
        if (serverContent.interrupted) {
          playbackQueueRef.current = [];
          isPlayingRef.current = false;
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
  }, [processPlaybackQueue]);

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
      await fetch(`/api/interviews/${interviewId}/voice`, {
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
    } catch {
      // Silent — checkpoints are best-effort
    }
  }, [interviewId, accessToken]);

  // ── End Interview (internal) ───────────────────────────────────────

  const endInterviewInternal = useCallback(async () => {
    setInterviewState("WRAPPING_UP");

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
  }, [interviewId, accessToken, onInterviewEnd]);

  // ── Start Interview ────────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    try {
      setInterviewState("CONNECTING");

      // 1. Get config from server
      const initRes = await fetch(`/api/interviews/${interviewId}/voice-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({ error: "Init failed" }));
        throw new Error(err.error || `Init error: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { apiKey, systemPrompt, tools, voiceName, candidateName, model } = initData;
      candidateNameRef.current = candidateName;

      // 2. Set up audio context for playback
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      // 3. Set up mic capture
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = micStream;

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

          // Build setup message
          const toolDefs = tools.map((tool: { name: string; description: string; parameters: Record<string, unknown> }) => ({
            functionDeclarations: [{
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            }],
          }));

          const setupMsg = {
            setup: {
              model: model || "models/gemini-2.5-flash-native-audio-latest",
              generationConfig: {
                responseModalities: ["AUDIO", "TEXT"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
                  },
                },
                temperature: 0.7,
                maxOutputTokens: 4096,
              },
              systemInstruction: {
                parts: [{ text: systemPrompt }],
              },
              tools: toolDefs,
            },
          };

          console.log("[Voice] Setup model:", setupMsg.setup.model);
          ws.send(JSON.stringify(setupMsg));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(typeof event.data === "string" ? event.data : "{}");
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
      ws.onmessage = handleGeminiMessage;

      ws.onerror = (event) => {
        console.error("[Voice] WebSocket error:", event);
        setConnectionQuality("poor");
      };

      ws.onclose = (event) => {
        console.log("[Voice] WebSocket closed — code:", event.code, "reason:", event.reason);
        setIsConnected(false);
        setConnectionQuality("poor");
      };

      // 6. Send greeting trigger (setup is confirmed complete)
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

      // 7. Start mic audio capture → WebSocket
      const source = audioContext.createMediaStreamSource(micStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isMicEnabledRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPCM16(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

        wsRef.current.send(JSON.stringify({
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

      setInterviewState("IN_PROGRESS");
      setIsConnected(true);
      setAiState("thinking");
    } catch (err) {
      console.error("Failed to start voice interview:", err);
      setInterviewState("ERROR");
      onError?.(err instanceof Error ? err.message : "Failed to start interview");
    }
  }, [interviewId, accessToken, handleGeminiMessage, checkpointTranscript, onError]);

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
      playbackQueueRef.current = [];
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
    try {
      // Just restart the whole connection
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
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (checkpointTimerRef.current) {
        clearInterval(checkpointTimerRef.current);
        checkpointTimerRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

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

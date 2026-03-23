"use client";

/**
 * useVoiceInterview — Real-time voice interview hook
 *
 * Manages the full audio pipeline for voice interviews:
 * - POST requests to send audio/text/actions to the voice relay endpoint
 * - SSE (EventSource) to receive AI audio/text responses in real-time
 * - Mic capture → PCM 16-bit encoding → POST send
 * - Receive AI audio → decode → AudioContext playback
 * - Transcript state management
 * - Connection quality monitoring
 *
 * Architecture:
 *   Browser → POST /voice (audio chunks + text) → Gemini Live → SSE → Browser
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
  // State
  interviewState: InterviewState;
  aiState: AISpeakingState;
  transcript: TranscriptEntry[];
  isConnected: boolean;
  questionCount: number;
  connectionQuality: "good" | "fair" | "poor";

  // Actions
  startInterview: () => Promise<void>;
  endInterview: () => void;
  sendTextMessage: (text: string) => void;
  toggleMic: () => void;
  isMicEnabled: boolean;
}

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

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const reconnectTokenRef = useRef<string | null>(null);
  const isMicEnabledRef = useRef(true);

  // Keep ref in sync with state for use in audio callback
  useEffect(() => {
    isMicEnabledRef.current = isMicEnabled;
  }, [isMicEnabled]);

  // Update parent on state changes
  useEffect(() => {
    onStateChange?.(interviewState);
  }, [interviewState, onStateChange]);

  useEffect(() => {
    onTranscriptUpdate?.(transcript);
  }, [transcript, onTranscriptUpdate]);

  // ── Voice API Helper ─────────────────────────────────────────────

  const voiceApiUrl = `/api/interviews/${interviewId}/voice`;

  const postToVoice = useCallback(async (body: Record<string, unknown>) => {
    try {
      const res = await fetch(voiceApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, accessToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Voice API error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("Voice API POST failed:", err);
      throw err;
    }
  }, [voiceApiUrl, accessToken]);

  // ── SSE Connection (Server → Client) ──────────────────────────────

  const connectSSE = useCallback(() => {
    const abort = new AbortController();
    sseAbortRef.current = abort;

    const sseUrl = `${voiceApiUrl}?token=${encodeURIComponent(accessToken)}`;

    // Use fetch-based SSE for better control over connection lifecycle
    (async () => {
      try {
        const res = await fetch(sseUrl, {
          signal: abort.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connection failed: ${res.status}`);
        }

        setIsConnected(true);
        setConnectionQuality("good");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE data lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                handleServerMessage(JSON.parse(jsonStr));
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return; // Expected on cleanup
        console.error("SSE connection error:", err);
        setConnectionQuality("poor");
        setIsConnected(false);
      }
    })();
  }, [voiceApiUrl, accessToken]);

  // ── Server Message Handler ───────────────────────────────────────

  const handleServerMessage = useCallback((message: any) => {
    switch (message.type) {
      case "audio":
        // AI audio response — decode and queue for playback
        setAiState("speaking");
        const audioData = base64ToFloat32(message.data);
        playbackQueueRef.current.push(audioData);
        processPlaybackQueue();
        break;

      case "text":
        if (message.text === "__turn_complete__") {
          setAiState("listening");
          break;
        }
        // Transcript update
        const entry: TranscriptEntry = {
          role: (message.role === "interviewer" ? "interviewer" : "candidate") as "interviewer" | "candidate",
          content: message.text,
          timestamp: new Date().toISOString(),
        };
        setTranscript((prev) => [...prev, entry]);
        break;

      case "questionCount":
        setQuestionCount(message.count);
        break;

      case "toolCall":
        // UI can react to section changes, difficulty adjustments, etc.
        break;

      case "interviewEnd":
        setInterviewState("COMPLETED");
        onInterviewEnd?.();
        break;

      case "waiting":
        // Session not yet active, keep polling
        break;
    }
  }, [onInterviewEnd]);

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

  // ── Audio Capture Setup ──────────────────────────────────────────

  const setupAudioCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    // Capture mic audio and POST to server
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isMicEnabledRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = float32ToPCM16(inputData);
      const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

      // Fire-and-forget audio POST — don't await to avoid blocking capture
      postToVoice({ type: "audio", data: base64 }).catch(() => {});
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    return audioContext;
  }, [postToVoice]);

  // ── Public Actions ───────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    try {
      setInterviewState("CONNECTING");

      // Set up audio capture first
      await setupAudioCapture();

      // Start SSE listener for receiving AI responses
      connectSSE();

      // Signal server to begin the interview
      const result = await postToVoice({ action: "begin_interview" });
      if (result.reconnectToken) {
        reconnectTokenRef.current = result.reconnectToken;
      }

      setInterviewState("IN_PROGRESS");
      setIsConnected(true);
    } catch (err) {
      setInterviewState("ERROR");
      onError?.(err instanceof Error ? err.message : "Failed to start interview");
    }
  }, [setupAudioCapture, connectSSE, postToVoice, onError]);

  const endInterview = useCallback(() => {
    setInterviewState("WRAPPING_UP");
    postToVoice({ action: "end_interview" }).catch((err) => {
      console.error("Failed to end interview:", err);
    });
  }, [postToVoice]);

  const sendTextMessage = useCallback((text: string) => {
    postToVoice({ type: "text", message: text }).catch((err) => {
      console.error("Failed to send text message:", err);
    });

    // Add to local transcript immediately
    setTranscript((prev) => [
      ...prev,
      {
        role: "candidate",
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [postToVoice]);

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

  // ── Cleanup ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Abort SSE connection
      if (sseAbortRef.current) {
        sseAbortRef.current.abort();
        sseAbortRef.current = null;
      }

      // Stop polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      // Close audio context
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
    startInterview,
    endInterview,
    sendTextMessage,
    toggleMic,
    isMicEnabled,
  };
}

// ── Audio Utility Functions ────────────────────────────────────────────

/**
 * Convert Float32 audio samples to PCM 16-bit.
 */
function float32ToPCM16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert base64 PCM 16-bit audio to Float32 for playback.
 */
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

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

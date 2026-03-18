"use client";

/**
 * useVoiceInterview — Real-time voice interview hook
 *
 * Manages the full audio pipeline for voice interviews:
 * - WebSocket connection to the voice relay endpoint
 * - Mic capture → PCM 16-bit encoding → WebSocket send
 * - Receive AI audio → decode → AudioContext playback
 * - Transcript state management
 * - Interview state machine
 * - Connection quality monitoring
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
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update parent on state changes
  useEffect(() => {
    onStateChange?.(interviewState);
  }, [interviewState, onStateChange]);

  useEffect(() => {
    onTranscriptUpdate?.(transcript);
  }, [transcript, onTranscriptUpdate]);

  // ── WebSocket Connection ─────────────────────────────────────────

  const connectWebSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/interviews/${interviewId}/voice?token=${accessToken}`;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setIsConnected(true);
        setInterviewState("READY");
        resolve(ws);
      };

      ws.onmessage = (event) => {
        handleServerMessage(event.data);
      };

      ws.onerror = () => {
        setConnectionQuality("poor");
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (event.code !== 1000) {
          setInterviewState("ERROR");
          onError?.(`Connection closed: ${event.reason || "Unknown reason"}`);
        }
      };

      wsRef.current = ws;
    });
  }, [interviewId, accessToken, onError]);

  // ── Audio Setup ──────────────────────────────────────────────────

  const setupAudio = useCallback(async () => {
    // Get microphone access
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

    // Create AudioContext for capture and playback
    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    // Set up audio capture via ScriptProcessor (wider browser support than AudioWorklet)
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isMicEnabled || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to PCM 16-bit
      const pcm16 = float32ToPCM16(inputData);

      // Convert to base64 for JSON transport
      const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

      // Send to server
      wsRef.current.send(JSON.stringify({
        type: "audio",
        data: base64,
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    return audioContext;
  }, [isMicEnabled]);

  // ── Server Message Handler ───────────────────────────────────────

  const handleServerMessage = useCallback((data: ArrayBuffer | string) => {
    try {
      const message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));

      switch (message.type) {
        case "audio":
          // AI audio response — decode and queue for playback
          setAiState("speaking");
          const audioData = base64ToFloat32(message.data);
          playbackQueueRef.current.push(audioData);
          processPlaybackQueue();
          break;

        case "text":
          // Transcript update
          const entry: TranscriptEntry = {
            role: message.role || "interviewer",
            content: message.text,
            timestamp: new Date().toISOString(),
          };
          setTranscript((prev) => [...prev, entry]);
          break;

        case "state":
          // AI state change
          setAiState(message.aiState || "idle");
          break;

        case "turnComplete":
          setAiState("listening");
          break;

        case "questionCount":
          setQuestionCount(message.count);
          break;

        case "interviewEnd":
          setInterviewState("COMPLETED");
          onInterviewEnd?.();
          break;

        case "error":
          onError?.(message.message);
          break;

        case "pong":
          // Connection health check response
          setConnectionQuality("good");
          break;
      }
    } catch (err) {
      console.error("Failed to parse server message:", err);
    }
  }, [onError, onInterviewEnd]);

  // ── Audio Playback ───────────────────────────────────────────────

  const processPlaybackQueue = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) return;
    if (!audioContextRef.current) return;

    isPlayingRef.current = true;
    const audioData = playbackQueueRef.current.shift()!;

    const buffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    buffer.copyToChannel(new Float32Array(audioData), 0);

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

  // ── Public Actions ───────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    try {
      setInterviewState("CONNECTING");

      // Connect WebSocket
      await connectWebSocket();

      // Set up audio
      await setupAudio();

      // Send start signal
      wsRef.current?.send(JSON.stringify({
        type: "start",
        action: "begin_interview",
      }));

      setInterviewState("IN_PROGRESS");

      // Start ping interval for connection quality monitoring
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
        }
      }, 10000);
    } catch (err) {
      setInterviewState("ERROR");
      onError?.(err instanceof Error ? err.message : "Failed to start interview");
    }
  }, [connectWebSocket, setupAudio, onError]);

  const endInterview = useCallback(() => {
    setInterviewState("WRAPPING_UP");

    // Signal server to end interview
    wsRef.current?.send(JSON.stringify({
      type: "end",
      action: "end_interview",
    }));
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: "text",
      message: text,
    }));

    // Add to local transcript
    setTranscript((prev) => [
      ...prev,
      {
        role: "candidate",
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const toggleMic = useCallback(() => {
    setIsMicEnabled((prev) => {
      const newState = !prev;
      // Mute/unmute the actual media stream
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
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmount");
        wsRef.current = null;
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

      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
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

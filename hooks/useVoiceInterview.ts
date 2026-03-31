"use client";

/**
 * useVoiceInterview — Client-side Gemini Live WebSocket (Thin I/O Terminal)
 *
 * ARCHITECTURE CONTRACT (REM-2):
 * This hook is a THIN I/O TERMINAL. It does NOT perform orchestration.
 *
 * What this hook does (I/O only):
 * - Connects directly to Gemini Live API from the browser
 * - Streams audio bidirectionally over WebSocket
 * - Renders transcript and UI state
 * - Sends finalized turns to server via turn-commit protocol
 * - Handles reconnection mechanics (connect/disconnect/retry)
 *
 * What this hook does NOT do (server-owned):
 * - Question selection or sequencing (Gemini drives via system prompt)
 * - Memory assembly or context composition (server: memory-orchestrator)
 * - Fact extraction or verification (server: fact-extractor, grounding-gate)
 * - State machine transitions (server: interviewer-state, session-brain)
 * - Contradiction detection (server: semantic-contradiction-detector)
 * - Output gating (server: output-gate)
 *
 * Server validates every turn post-hoc via turn-commit. Gemini drives
 * the conversation (question selection, module sequencing, difficulty).
 * The server CANNOT inject mid-session system instructions.
 *
 * NETWORK INVARIANT (REM-1):
 * `connectionQuality` is used ONLY for UI display and checkpoint frequency.
 * It must NEVER influence logic paths, question selection, or memory assembly.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { backupTranscript, clearTranscriptBackup, getBackedUpTranscript } from "@/lib/transcript-backup";
// R9: generateConversationSummary removed — canonical ledger is authoritative memory
import type { CandidateProfile } from "@/lib/session-store";
import {
  transitionReconnectState,
  stateToPhase,
  MAX_RECOVERY_ATTEMPTS,
  shouldRateLimit,
} from "@/lib/reconnect-state-machine";
import type { ReconnectState, ReconnectPhase } from "@/lib/reconnect-state-machine";

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

export interface SessionSnapshot {
  transcript: TranscriptEntry[];
  moduleScores: Array<{ module: string; score: number; reason: string; sectionNotes?: string }>;
  questionCount: number;
  interviewerState: string | null;
  ledgerVersion: number;
  stateHash: string;
  reconnectToken: string;
  askedQuestions: string[];
  currentModule: string;
  candidateProfile: CandidateProfile | null;
  difficultyLevel: string;
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
  reconnectPhase: "checking" | "restoring" | "verifying" | "recovering" | "re-synced" | "resume-failed" | "recovery-failed" | "recovery-rate-limited" | null;
  reconnectAttempt: number;
  reconnectMax: number;
  micIsSilent: boolean;
  startInterview: () => Promise<void>;
  endInterview: () => void;
  sendTextMessage: (text: string) => void;
  toggleMic: () => void;
  isMicEnabled: boolean;
  reconnect: () => Promise<void>;
  retryVoice: () => Promise<void>;
  pauseInterview: () => Promise<void>;
  resumeInterview: () => Promise<void>;
  getSessionSnapshot: () => SessionSnapshot;
}

// ── Constants ────────────────────────────────────────────────────────────

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
  const [reconnectPhase, setReconnectPhase] = useState<ReconnectPhase>(null);
  const [micIsSilent, setMicIsSilent] = useState(false);

  // Mirror aiState in a ref so audio processor callback can read it
  const aiStateRef = useRef<AISpeakingState>(aiState);
  useEffect(() => { aiStateRef.current = aiState; }, [aiState]);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0); // Tracks when the next audio chunk should start
  const isMicEnabledRef = useRef(true);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const moduleScoresRef = useRef<Array<{ module: string; score: number; reason: string; sectionNotes?: string }>>([]);
  const checkpointTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionCountRef = useRef(0);
  const candidateNameRef = useRef("");
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Adaptive reconnect limits based on WebSocket close code
  const getMaxReconnectAttempts = (code: number): number => {
    if (code === 1006 || code === 1001 || code === 4000) return 10; // transient/network — generous
    if (code === 4502) return 6;  // upstream Gemini error — moderate
    if (code === 4001) return 1;  // auth/token failure — minimal
    return 5;                     // default
  };
  const lastCloseCodeRef = useRef<number>(1000); // Track last WS close code for adaptive limits
  const intentionalCloseRef = useRef(false); // True when we close the WS ourselves
  const currentTurnTextRef = useRef(""); // Accumulates interviewer transcript fragments within a turn
  const currentCandidateTextRef = useRef(""); // Accumulates candidate speech transcription

  // Enterprise resilience refs
  const isStartingRef = useRef(false); // Mutex: prevents concurrent startInterview() calls
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef(Date.now()); // Tracks last message from Gemini
  const lastSendTimeRef = useRef(Date.now()); // Tracks last data sent to Gemini (for keep-alive)
  const qualityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const droppedFramesRef = useRef(0); // Consecutive frames dropped due to backpressure
  const audioQueueRef = useRef<string[]>([]); // Bounded ring buffer for backpressure (max 50 base64 PCM frames)
  const knowledgeGraphRef = useRef<Record<string, unknown> | null>(null); // LLM-powered semantic memory from recovery
  const silentFramesRef = useRef(0); // Consecutive silent audio frames
  const checkpointResultsRef = useRef<boolean[]>([]); // Rolling window of last 5 checkpoint results
  const consecutiveSetupFailuresRef = useRef(0); // Circuit breaker counter
  const tabHiddenRef = useRef(false); // F5: Tab visibility — suppress heartbeat when hidden
  const circuitBreakerStateRef = useRef<"CLOSED" | "OPEN" | "HALF_OPEN">("CLOSED"); // F3: Circuit breaker state
  const circuitBreakerTimerRef = useRef<NodeJS.Timeout | null>(null); // F3: OPEN → HALF_OPEN timer
  const endInterviewInternalRef = useRef<(() => void) | null>(null); // Forward ref for checkpoint→endInterview
  const checkpointTranscriptRef = useRef<(() => void) | null>(null); // Forward ref for handleToolCall→checkpoint
  const onErrorRef = useRef(onError); // C5/R5: Stable ref for onError to prevent stale closures in setTimeout
  const audioProcessorErrorCountRef = useRef(0); // F2: Error counter for audio processor
  const micRevokedRef = useRef(false); // F6: Track mic revocation
  const askedQuestionsRef = useRef<string[]>([]); // Question dedup: track AI questions to prevent repeats
  const reconnectTokenRef = useRef<string>(""); // HMAC-signed reconnect token from server
  const lockOwnerTokenRef = useRef<string>(""); // Lock owner token for session recovery authorization
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null); // H1: Cancel on unmount to prevent stale closures
  const lastCheckpointDigestRef = useRef<string | null>(null); // Fix 2: Track last checkpoint digest for reconciliation
  const introDoneRef = useRef(false); // R3: Server-authoritative intro suppression (replaces regex introFilterActiveRef)
  // Enterprise memory refs — persisted across reconnects
  const difficultyLevelRef = useRef<string>("mid");
  const flaggedFollowUpsRef = useRef<Array<{ topic: string; reason: string; depth?: string }>>([]);
  const currentModuleRef = useRef<string>("");
  const candidateProfileRef = useRef<CandidateProfile | null>(null);
  const interviewerStateRef = useRef<string | null>(null); // Serialized InterviewerState for deterministic continuity
  const ledgerVersionRef = useRef<number>(-1); // R6: Track server ledger version for Phase 2 protocol
  const stateHashRef = useRef<string>(""); // R6: Track server state hash for Phase 2 protocol
  const contextChecksumRef = useRef<string>(""); // Turn-commit continuity contract checksum
  const turnCommitEnabledRef = useRef(false); // Set from voice-init response
  const interviewStartTimeRef = useRef<number>(0); // for adaptive checkpoint intervals
  const lastCheckpointTimeRef = useRef<number>(0); // debounce event-driven checkpoints
  const reconnectStartTimeRef = useRef<number>(0); // Tracks reconnect latency for SLO
  const poorQualityCountRef = useRef(0); // Debounce: consecutive "poor" checks before triggering
  const lastRecoveryCallRef = useRef<number>(0); // Rate-limit recovery API calls
  const recoveryInFlightRef = useRef(false); // Mutex: prevent concurrent recovery API calls
  const reconnectStateRef = useRef<ReconnectState>("DISCONNECTED"); // Enforced reconnect state machine
  const reconnectTimestampsRef = useRef<number[]>([]); // CF4: Track reconnect cycle timestamps for rate-limiting
  const memoryPacketVersionRef = useRef<number>(0); // Monotonic version for stale packet detection

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

    // 4. Reset turn text accumulators and audio queue
    currentTurnTextRef.current = "";
    currentCandidateTextRef.current = "";
    audioQueueRef.current = [];

    // 5. Clear heartbeat, quality monitoring, and checkpoint intervals
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
      qualityCheckIntervalRef.current = null;
    }
    if (checkpointTimerRef.current) {
      clearInterval(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }

    // 6. Cancel pending reconnect timeout (H1: prevents stale closure)
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 7. Reset monitoring counters
    droppedFramesRef.current = 0;
    silentFramesRef.current = 0;
    setMicIsSilent(false);
  }, []);

  // Keep refs in sync
  useEffect(() => { isMicEnabledRef.current = isMicEnabled; }, [isMicEnabled]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]); // C5/R5: Keep onError ref current

  // Notify parent on state changes
  useEffect(() => { onStateChange?.(interviewState); }, [interviewState, onStateChange]);
  useEffect(() => { onTranscriptUpdate?.(transcript); }, [transcript, onTranscriptUpdate]);

  // F5: Tab visibility detection — pause audio & suppress heartbeat when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      tabHiddenRef.current = document.hidden;
      if (document.hidden) {
        // Tab hidden: suppress heartbeat timeout (handled in heartbeat interval)
        // Optionally pause audio processor to save resources
        if (processorRef.current) {
          try { processorRef.current.disconnect(); } catch { /* already disconnected */ }
        }
      } else {
        // Tab visible: resume audio processor, reset heartbeat timer
        lastMessageTimeRef.current = Date.now();
        if (processorRef.current && audioContextRef.current && mediaStreamRef.current) {
          try {
            const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            source.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);
          } catch { /* reconnect will handle this */ }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

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

  // ── Helpers ────────────────────────────────────────────────────────
  
  const base64ToFloat32 = useCallback((base64: string): Float32Array => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
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

            // Turn-commit protocol: commit candidate turn to server
            if (turnCommitEnabledRef.current) {
              try {
                const commitRes = await fetch(`/api/interviews/${interviewId}/voice/turn-commit`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                  body: JSON.stringify({
                    turnId: crypto.randomUUID(),
                    role: "user",
                    content: candidateText,
                    contextChecksum: contextChecksumRef.current,
                    clientTimestamp: new Date().toISOString(),
                  }),
                });
                if (commitRes.ok) {
                  const commitData = await commitRes.json();
                  if (commitData.committed) {
                    contextChecksumRef.current = commitData.contextChecksum;
                    // AF1: Sync server-authoritative state on every turn-commit
                    if (commitData.stateHash) stateHashRef.current = commitData.stateHash;
                    if (typeof commitData.turnIndex === "number") ledgerVersionRef.current = commitData.turnIndex;
                    if (commitData.interviewerState) interviewerStateRef.current = commitData.interviewerState;
                  }
                }
              } catch { /* Non-fatal: fall back to checkpoint */ }
            }

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
            let finalText = currentTurnTextRef.current.trim();

            // Turn-commit protocol: commit AI turn to server for validation
            // Server handles intro suppression, contradiction gates, and memory confidence checks
            if (turnCommitEnabledRef.current) {
              try {
                const commitRes = await fetch(`/api/interviews/${interviewId}/voice/turn-commit`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                  body: JSON.stringify({
                    turnId: crypto.randomUUID(),
                    role: "model",
                    content: finalText,
                    contextChecksum: contextChecksumRef.current,
                    clientTimestamp: new Date().toISOString(),
                  }),
                });
                if (!commitRes.ok) throw new Error(`Turn-commit failed: ${commitRes.status}`);
                const commitData = await commitRes.json();
                if (commitData.committed) {
                  contextChecksumRef.current = commitData.contextChecksum;
                  // AF1: Sync server-authoritative state on every turn-commit
                  if (commitData.stateHash) stateHashRef.current = commitData.stateHash;
                  if (typeof commitData.turnIndex === "number") ledgerVersionRef.current = commitData.turnIndex;
                  if (commitData.interviewerState) interviewerStateRef.current = commitData.interviewerState;
                  // Apply server corrections if any (e.g., re-introduction stripped by output gate)
                  if (commitData.violations?.length > 0) {
                    console.warn(`[Voice] Turn-commit: ${commitData.violations.length} violation(s)`);
                    // If server returned a sanitized response, use it
                    const reintroViolation = commitData.violations.find((v: { type: string }) => v.type === "reintroduction");
                    if (reintroViolation) {
                      finalText = "Let's continue where we left off.";
                    }
                  }
                  if (commitData.memorySlotWarnings?.length > 0) {
                    console.warn(`[Voice] Memory warnings: ${commitData.memorySlotWarnings.length} warning(s)`);
                    // Fix 2: Log memory confidence warnings — server-side gates enforce caution
                    // Note: Cannot inject mid-session system instructions via Gemini Live WebSocket
                    // (clientContent with role:"user" would be treated as candidate speech).
                    // Server-side output gate + grounding gate enforce safe behavior instead.
                    for (const w of commitData.memorySlotWarnings) {
                      if (w.includes("LOW_MEMORY_CONFIDENCE")) {
                        console.warn("[Voice] LOW_MEMORY_CONFIDENCE — server gates will enforce cautious output");
                      }
                      if (w.includes("STALE_FACTS")) {
                        console.warn("[Voice] STALE_FACTS — server grounding gate will filter unverified claims");
                      }
                    }
                  }
                } else if (
                  (commitData.reason === "OUTPUT_GATE_BLOCKED" || commitData.reason === "GROUNDING_GATE_BLOCKED") &&
                  commitData.corrections
                ) {
                  // Server blocked the turn — use sanitized response instead
                  finalText = commitData.corrections;
                  contextChecksumRef.current = commitData.contextChecksum;
                } else if (commitData.reason === "GROUNDING_GATE_BLOCKED" && !commitData.corrections) {
                  // Grounding gate blocked without corrections — use safe fallback
                  finalText = "Let's continue with the interview.";
                }
              } catch { /* Non-fatal: fall back to checkpoint-based persistence */ }
            }

            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "interviewer") {
                return [...prev.slice(0, -1), { ...last, content: finalText, finalized: true }];
              }
              return [...prev, { role: "interviewer" as const, content: finalText, timestamp: new Date().toISOString(), finalized: true }];
            });
            // Count questions and track for dedup
            if (finalText.includes("?")) {
              setQuestionCount((prev) => prev + 1);
              if (askedQuestionsRef.current.length >= 50) {
                askedQuestionsRef.current = askedQuestionsRef.current.slice(-49);
              }
              askedQuestionsRef.current.push(finalText);
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

    // Helper: trigger immediate checkpoint after state-changing tool calls (debounced 5s)
    // C3/R5: Guard against null ref — tool calls may arrive before refs are assigned
    const triggerEventCheckpoint = () => {
      const now = Date.now();
      if (now - lastCheckpointTimeRef.current > 5000 && checkpointTranscriptRef.current) {
        lastCheckpointTimeRef.current = now;
        checkpointTranscriptRef.current();
      }
    };

    switch (name) {
      case "adjustDifficulty":
        console.log(`[Voice] Difficulty: ${args.currentLevel} → ${args.newLevel} (${args.reason})`);
        difficultyLevelRef.current = args.newLevel as string;
        sendResponse({ acknowledged: true });
        triggerEventCheckpoint();
        break;

      case "moveToNextSection":
        console.log(`[Voice] Section: ${args.currentSection} → ${args.nextSection}`);
        currentModuleRef.current = args.nextSection as string;
        if (args.sectionScore !== undefined) {
          moduleScoresRef.current.push({
            module: args.currentSection as string,
            score: args.sectionScore as number,
            reason: args.reason as string,
            sectionNotes: (args.sectionNotes as string) || undefined,
          });
        }
        sendResponse({ acknowledged: true });
        triggerEventCheckpoint();
        break;

      case "flagForFollowUp":
        console.log(`[Voice] Follow-up: ${args.topic} (${args.reason})`);
        flaggedFollowUpsRef.current.push({
          topic: args.topic as string,
          reason: args.reason as string,
          depth: (args.depth as string) || undefined,
        });
        sendResponse({ acknowledged: true });
        break;

      case "updateCandidateProfile": {
        console.log(`[Voice] Candidate profile update: strengths=${(args.strengths as string[])?.length}, weaknesses=${(args.weaknesses as string[])?.length}`);
        const existing = candidateProfileRef.current;
        const newStrengths = (args.strengths as string[]) || [];
        const newWeaknesses = (args.weaknesses as string[]) || [];
        if (existing) {
          // Merge: append and deduplicate
          existing.strengths = [...new Set([...existing.strengths, ...newStrengths])];
          existing.weaknesses = [...new Set([...existing.weaknesses, ...newWeaknesses])];
          if (args.communicationStyle) existing.communicationStyle = args.communicationStyle as string;
          if (args.confidenceLevel) existing.confidenceLevel = args.confidenceLevel as "low" | "moderate" | "high";
          if (args.notableObservations) existing.notableObservations = args.notableObservations as string;
        } else {
          candidateProfileRef.current = {
            strengths: newStrengths,
            weaknesses: newWeaknesses,
            communicationStyle: (args.communicationStyle as string) || undefined,
            confidenceLevel: (args.confidenceLevel as "low" | "moderate" | "high") || undefined,
            notableObservations: (args.notableObservations as string) || undefined,
          };
        }
        sendResponse({ acknowledged: true });
        triggerEventCheckpoint();
        break;
      }

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
          // Enterprise memory fields
          currentDifficultyLevel: difficultyLevelRef.current,
          flaggedFollowUps: flaggedFollowUpsRef.current,
          currentModule: currentModuleRef.current,
          candidateProfile: candidateProfileRef.current,
          askedQuestions: askedQuestionsRef.current.slice(0, 50),
          clientMemoryPacketVersion: memoryPacketVersionRef.current,
        }),
      });
      if (res.ok) {
        checkpointResultsRef.current = [...checkpointResultsRef.current.slice(-4), true];
        // Store checkpoint digest and ledger version for Phase 2 recovery protocol
        try {
          const checkpointData = await res.json();
          if (checkpointData.checkpointDigest) {
            lastCheckpointDigestRef.current = checkpointData.checkpointDigest;
          }
          if (typeof checkpointData.ledgerVersion === "number") {
            ledgerVersionRef.current = checkpointData.ledgerVersion;
          }
          if (checkpointData.stateHash) {
            stateHashRef.current = checkpointData.stateHash;
          }
          if (typeof checkpointData.memoryPacketVersion === "number") {
            memoryPacketVersionRef.current = checkpointData.memoryPacketVersion;
          }
          // Output gate enforcement: replace AI content if server blocked and sanitized
          if (checkpointData.correctedAiResponse && transcriptRef.current.length > 0) {
            // Find the last AI turn in the transcript and replace its content
            for (let i = transcriptRef.current.length - 1; i >= 0; i--) {
              const turn = transcriptRef.current[i];
              if (turn.role === "interviewer") {
                transcriptRef.current[i] = { ...turn, content: checkpointData.correctedAiResponse };
                break;
              }
            }
          }
        } catch { /* response already consumed or empty */ }
        // Clear IndexedDB backup on successful server save
        clearTranscriptBackup(interviewId).catch(() => {});
        // F8: Refresh session TTL on successful checkpoint
        try {
          const ttlRes = await fetch(`/api/interviews/${interviewId}/voice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken, action: "refresh_ttl" }),
          });
          // Server-side max duration enforcement
          if (ttlRes.status === 410) {
            const ttlBody = await ttlRes.json().catch(() => ({}));
            if (ttlBody.forceEnd) {
              console.warn("[Voice] Max interview duration exceeded — auto-ending");
              onError?.("Maximum interview duration reached. Ending interview.");
              endInterviewInternalRef.current?.();
              return;
            }
          }
        } catch { /* best-effort TTL refresh */ }

        // R5/R9: Summary generation removed — canonical ledger is authoritative.
        // Reconnect context is now built from full transcript without lossy summarization.
      } else if (res.status === 503) {
        // Handle gate hard-block: apply sanitized response and retry
        try {
          const errorBody = await res.json();
          if (errorBody.code === "GATE_HARD_BLOCK" && errorBody.correctedAiResponse) {
            // Apply the sanitized response to the last AI turn
            for (let i = transcriptRef.current.length - 1; i >= 0; i--) {
              const turn = transcriptRef.current[i];
              if (turn.role === "interviewer") {
                transcriptRef.current[i] = { ...turn, content: errorBody.correctedAiResponse };
                break;
              }
            }
            console.warn("[Voice] Gate hard-blocked checkpoint — applied sanitized response, will retry on next cycle");
            // Don't throw — the sanitized content will be sent on next checkpoint cycle
          } else {
            throw new Error(`Checkpoint HTTP 503: ${errorBody.code || "unknown"}`);
          }
        } catch (parseErr) {
          throw parseErr;
        }
      } else {
        throw new Error(`Checkpoint HTTP ${res.status}`);
      }
    } catch {
      checkpointResultsRef.current = [...checkpointResultsRef.current.slice(-4), false];
      // Fallback: save transcript to IndexedDB with 3-retry exponential backoff
      let backupOk = false;
      for (let attempt = 0; attempt < 3 && !backupOk; attempt++) {
        try {
          await backupTranscript(
            interviewId,
            transcriptRef.current,
            moduleScoresRef.current,
            questionCountRef.current,
            {
              currentDifficultyLevel: difficultyLevelRef.current,
              flaggedFollowUps: flaggedFollowUpsRef.current,
              currentModule: currentModuleRef.current,
              candidateProfile: candidateProfileRef.current || undefined,
            }
          );
          backupOk = true;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
        }
      }
      if (!backupOk) {
        console.error("[Voice] CRITICAL: Both checkpoint and IndexedDB backup failed after 3 attempts");
      }
      // Warn if 3+ failures in last 5 attempts (rolling window, not consecutive)
      const recentFailures = checkpointResultsRef.current.filter((r) => !r).length;
      if (recentFailures >= 3) {
        console.warn(`[Voice] ${recentFailures}/5 recent checkpoints failed — transcript backed up to IndexedDB`);
        onError?.("Progress may not be saving — check your connection. Local backup active.");
      }
    }
  }, [interviewId, accessToken, onError]);

  // ── Report SLO Event (client → server) ────────────────────────────

  const reportSLOEvent = useCallback(async (sloName: string, success: boolean) => {
    try {
      await fetch(`/api/interviews/${interviewId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, action: "record_slo", sloName, success }),
      });
    } catch { /* best-effort SLO reporting */ }
  }, [interviewId, accessToken]);

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

    // M7/R5: Clear reconnect state so new interview doesn't send stale tokens
    reconnectTokenRef.current = "";
    lockOwnerTokenRef.current = "";
    lastCheckpointDigestRef.current = null;

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

    // Drain any IndexedDB transcript backup before final save
    try {
      const backup = await getBackedUpTranscript(interviewId);
      if (backup && backup.transcript.length > transcriptRef.current.length) {
        // IndexedDB has more data than current state — use it
        transcriptRef.current = backup.transcript as typeof transcriptRef.current;
        moduleScoresRef.current = backup.moduleScores;
        questionCountRef.current = backup.questionCount;
      }
    } catch { /* IndexedDB unavailable — use current state */ }

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
      // Clear IndexedDB backup on successful final save
      clearTranscriptBackup(interviewId).catch(() => {});
    } catch (err) {
      console.error("Failed to save interview end:", err);
    }

    setInterviewState("COMPLETED");
    onInterviewEnd?.();
  }, [interviewId, accessToken, onInterviewEnd, cleanupAudioResources]);

  // Keep refs in sync for forward-references from callbacks
  checkpointTranscriptRef.current = checkpointTranscript;
  endInterviewInternalRef.current = endInterviewInternal;

  // ── Start Interview ────────────────────────────────────────────────

  const startInterview = useCallback(async () => {
    // Mutex: prevent concurrent startInterview() calls
    if (isStartingRef.current) {
      console.warn("[Voice] startInterview() already in progress — skipping");
      return;
    }

    // HARD GATE: On reconnect, startInterview() requires server verification.
    // RECOVERY_CONFIRMED = verified via recovery API (has token).
    // RECOVERY_PENDING = will be verified via voice-init (no token, transcript exists).
    // Fresh starts (no transcript) bypass this check.
    const isFirstStart = transcriptRef.current.length === 0;
    if (!isFirstStart
        && reconnectStateRef.current !== "RECOVERY_CONFIRMED"
        && reconnectStateRef.current !== "RECOVERY_PENDING") {
      console.error(`[Voice] BLOCKED: startInterview() requires RECOVERY_CONFIRMED or RECOVERY_PENDING, got ${reconnectStateRef.current}`);
      return;
    }

    isStartingRef.current = true;

    try {
      intentionalCloseRef.current = false;
      setInterviewState("CONNECTING");

      // Transition to SOCKET_OPEN if in reconnect flow
      if (!isFirstStart && reconnectStateRef.current === "RECOVERY_CONFIRMED") {
        try {
          reconnectStateRef.current = transitionReconnectState("RECOVERY_CONFIRMED", "SOCKET_OPEN");
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
        } catch {
          console.error("[Voice] State machine transition to SOCKET_OPEN failed");
        }
      }

      // 0. Clean up old audio resources (critical for reconnect)
      // Clear stale question dedup on fresh start (not reconnect)
      if (transcriptRef.current.length === 0) {
        askedQuestionsRef.current = [];
        introDoneRef.current = false; // M2: Reset intro state on fresh start
      }
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

      // F3: Circuit breaker with HALF_OPEN recovery
      if (consecutiveSetupFailuresRef.current >= 3 && circuitBreakerStateRef.current !== "HALF_OPEN") {
        if (circuitBreakerStateRef.current !== "OPEN") {
          circuitBreakerStateRef.current = "OPEN";
          console.error("[Voice] Circuit breaker OPEN — 3 consecutive setup failures");
          try { await checkpointTranscriptRef.current?.(); } catch { /* CF1: best-effort checkpoint before fallback */ }
          setFallbackToText(true);
          onError?.("Voice connection failed repeatedly. Switching to text mode.");
          // M2/R5: Clear any existing timer before setting a new one
          if (circuitBreakerTimerRef.current) { clearTimeout(circuitBreakerTimerRef.current); }
          // After 30s, transition to HALF_OPEN to allow one retry
          circuitBreakerTimerRef.current = setTimeout(() => {
            circuitBreakerStateRef.current = "HALF_OPEN";
            console.log("[Voice] Circuit breaker → HALF_OPEN (retry allowed)");
          }, 30_000);
        }
        return;
      }

      // 1. Get config from server — pass reconnect context if resuming
      const isReconnect = transcriptRef.current.length > 0;
      const initBody: Record<string, unknown> = { accessToken };
      if (isReconnect) {
        initBody.reconnect = true;
        initBody.reconnectContext = {
          questionCount: questionCountRef.current,
          moduleScores: moduleScoresRef.current,
          askedQuestions: askedQuestionsRef.current,
          currentModule: currentModuleRef.current || (moduleScoresRef.current.length > 0
            ? moduleScoresRef.current[moduleScoresRef.current.length - 1].module
            : null),
          // Enterprise memory fields (also persisted server-side — client sends as fallback)
          currentDifficultyLevel: difficultyLevelRef.current,
          flaggedFollowUps: flaggedFollowUpsRef.current,
          candidateProfile: candidateProfileRef.current,
        };
      }
      const initRes = await fetch(`/api/interviews/${interviewId}/voice-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initBody),
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
        if (initRes.status === 503) {
          consecutiveSetupFailuresRef.current = 3; // Don't retry during maintenance
          throw new Error(err.message || "System is temporarily under maintenance. Please try again in a few minutes.");
        }
        throw new Error(err.error || `Init error: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const { relayUrl, sessionToken, systemPrompt, tools, voiceName, candidateName, model, reconnectToken: initReconnectToken, lockOwnerToken: initLockOwnerToken, enterpriseMemory } = initData;
      candidateNameRef.current = candidateName;
      if (initReconnectToken) reconnectTokenRef.current = initReconnectToken;
      if (initLockOwnerToken) lockOwnerTokenRef.current = initLockOwnerToken;

      // Restore enterprise memory refs from server state (server wins over stale client)
      if (enterpriseMemory) {
        if (enterpriseMemory.currentDifficultyLevel) difficultyLevelRef.current = enterpriseMemory.currentDifficultyLevel;
        if (enterpriseMemory.flaggedFollowUps) flaggedFollowUpsRef.current = enterpriseMemory.flaggedFollowUps;
        if (enterpriseMemory.currentModule) currentModuleRef.current = enterpriseMemory.currentModule;
        if (enterpriseMemory.candidateProfile) candidateProfileRef.current = enterpriseMemory.candidateProfile;
        if (enterpriseMemory.moduleScores) moduleScoresRef.current = enterpriseMemory.moduleScores;
        if (enterpriseMemory.interviewerState) interviewerStateRef.current = enterpriseMemory.interviewerState;
        console.log(`[Voice] Restored enterprise memory from server: difficulty=${enterpriseMemory.currentDifficultyLevel}, module=${enterpriseMemory.currentModule}, followUps=${enterpriseMemory.flaggedFollowUps?.length || 0}, moduleScores=${enterpriseMemory.moduleScores?.length || 0}`);
      }

      // Reset turn-commit refs before reading server state (server is authoritative)
      turnCommitEnabledRef.current = false;
      contextChecksumRef.current = "";

      // Enable turn-commit protocol if server indicates support
      if (initData.turnCommitEnabled) {
        turnCommitEnabledRef.current = true;
        if (initData.contextChecksum) {
          contextChecksumRef.current = initData.contextChecksum;
        }
      }

      // Fix 1: Complete server verification for tokenless reconnects.
      // voice-init with reconnect=true provides server-authoritative state
      // (reconnectToken, lockOwnerToken, enterpriseMemory) — this serves as verification.
      // Transition: RECOVERY_PENDING → RECOVERY_CONFIRMED → SOCKET_OPEN
      if (reconnectStateRef.current === "RECOVERY_PENDING") {
        try {
          reconnectStateRef.current = transitionReconnectState("RECOVERY_PENDING", "RECOVERY_CONFIRMED");
          reconnectStateRef.current = transitionReconnectState("RECOVERY_CONFIRMED", "SOCKET_OPEN");
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
        } catch {
          reconnectStateRef.current = "SOCKET_OPEN";
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
        }
      }

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
        micRevokedRef.current = false;

        // F6: Detect mic revocation — auto-attempt re-acquisition before failing
        const audioTrack = micStream.getAudioTracks()[0];
        if (audioTrack) {
          const handleTrackEnded = async () => {
            micRevokedRef.current = true;
            console.warn("[Voice] Mic track ended — attempting auto-recovery...");
            try {
              const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
              });
              mediaStreamRef.current = newStream;
              micRevokedRef.current = false;
              setMicIsSilent(false);
              // Re-attach listener to new track
              const newTrack = newStream.getAudioTracks()[0];
              if (newTrack) newTrack.onended = handleTrackEnded;
              // Reconnect ScriptProcessorNode input
              if (audioContextRef.current && processorRef.current) {
                const source = audioContextRef.current.createMediaStreamSource(newStream);
                source.connect(processorRef.current);
              }
              console.log("[Voice] Mic auto-recovered successfully");
            } catch {
              onError?.("Microphone disconnected. Please reconnect your mic and try again.");
              setMicIsSilent(true);
            }
          };
          audioTrack.onended = handleTrackEnded;
        }
      }

      // 4. Connect to voice relay WebSocket (API key stays server-side)
      const wsUrl = `${relayUrl}/ws?session=${encodeURIComponent(sessionToken)}`;
      console.log("[Voice] Connecting to voice relay...");
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
                  languageCode: "en-US",
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
            checkpointTranscriptRef.current?.(); // CF1: fire-and-forget checkpoint before fallback
            setFallbackToText(true);
          }
          return;
        }

        // Flush any partial AI turn text into transcript before reconnect
        if (currentTurnTextRef.current.trim()) {
          const partialEntry: TranscriptEntry = {
            role: "interviewer",
            content: currentTurnTextRef.current.trim(),
            timestamp: new Date().toISOString(),
            finalized: true,
          };
          transcriptRef.current = [...transcriptRef.current, partialEntry];
          setTranscript((prev) => [...prev, partialEntry]);
          currentTurnTextRef.current = "";
        }

        // Auto-reconnect with enforced state machine:
        // DISCONNECTED → RECOVERY_PENDING → RECOVERY_CONFIRMED → SOCKET_OPEN → LIVE
        lastCloseCodeRef.current = event.code;

        // Check max attempts (configurable, default 3)
        if (reconnectAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {
          reconnectStateRef.current = "FAILED";
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
          setConnectionQuality("poor");
          setIsReconnecting(false);
          onErrorRef.current?.(`Session recovery failed after ${MAX_RECOVERY_ATTEMPTS} attempts. Please use this link to resume: /interview/${interviewId}?resume=true`);
          reportSLOEvent("session.reconnect.success_rate", false);
          return;
        }

        // CF4: Rapid-reconnect rate-limit — block if 3+ reconnects in 60s
        reconnectTimestampsRef.current.push(Date.now());
        if (shouldRateLimit(reconnectTimestampsRef.current)) {
          try {
            if (reconnectStateRef.current === "LIVE" || reconnectStateRef.current === "SOCKET_OPEN") {
              reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current as "LIVE", "DISCONNECTED");
            }
            reconnectStateRef.current = transitionReconnectState("DISCONNECTED", "RATE_LIMITED");
          } catch {
            reconnectStateRef.current = "RATE_LIMITED";
          }
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
          setConnectionQuality("poor");
          setIsReconnecting(false);
          onErrorRef.current?.("Too many reconnect attempts. Please wait a moment before retrying, or switch to text mode.");
          reportSLOEvent("session.reconnect.rate_limited", true);
          return;
        }

        const attempt = reconnectAttemptsRef.current;
        const base = 1000;
        const exp = Math.pow(2, attempt);
        const jitter = Math.random() * base;
        const delay = Math.min(base * exp + jitter, 10000);
        console.log(`[Voice] Unexpected closure (code ${event.code}) — recovering in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RECOVERY_ATTEMPTS})`);
        reconnectAttemptsRef.current += 1;
        setIsReconnecting(true);
        setConnectionQuality("fair");
        reconnectStartTimeRef.current = Date.now();

        // Transition: DISCONNECTED → RECOVERY_PENDING (or stay if already in LIVE → DISCONNECTED cycle)
        try {
          if (reconnectStateRef.current === "LIVE" || reconnectStateRef.current === "SOCKET_OPEN") {
            reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current as "LIVE", "DISCONNECTED");
          }
          reconnectStateRef.current = transitionReconnectState("DISCONNECTED", "RECOVERY_PENDING");
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
        } catch (err) {
          console.error(JSON.stringify({
            event: "reconnect_state_violation",
            from: reconnectStateRef.current,
            to: "RECOVERY_PENDING",
            error: (err as Error).message,
            severity: "warning",
            timestamp: new Date().toISOString(),
          }));
          reconnectStateRef.current = "RECOVERY_PENDING";
          setReconnectPhase("recovering");
        }

        reconnectTimeoutRef.current = setTimeout(async () => {
          try {
            // Step 1: ALWAYS call recovery API when reconnectToken exists
            if (reconnectTokenRef.current) {
              // Gap 2: Skip if another recovery call is already in-flight
              if (recoveryInFlightRef.current) {
                console.log("[Voice] Recovery already in-flight — skipping duplicate call");
                return;
              }
              recoveryInFlightRef.current = true;
              lastRecoveryCallRef.current = Date.now();
              // Gap 1: AbortController with 15s timeout
              const controller = new AbortController();
              const abortTimeout = setTimeout(() => controller.abort(), 15000);
              let recoveryRes: Response;
              try {
                recoveryRes = await fetch(`/api/interviews/${interviewId}/voice/recover`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  signal: controller.signal,
                  body: JSON.stringify({
                    reconnectToken: reconnectTokenRef.current,
                    clientLedgerVersion: ledgerVersionRef.current,
                    clientStateHash: stateHashRef.current,
                    lockOwnerToken: lockOwnerTokenRef.current,
                    clientCheckpointDigest: lastCheckpointDigestRef.current,
                    clientTurnIndex: transcriptRef.current.length - 1,
                  }),
                });
              } finally {
                clearTimeout(abortTimeout);
                recoveryInFlightRef.current = false;
              }
              if (recoveryRes.ok) {
                const recovery = await recoveryRes.json();
                reconnectTokenRef.current = recovery.newReconnectToken;
                if (typeof recovery.ledgerVersion === "number") ledgerVersionRef.current = recovery.ledgerVersion;
                if (recovery.stateHash) stateHashRef.current = recovery.stateHash;
                introDoneRef.current = true;
                if (Array.isArray(recovery.askedQuestions)) {
                  askedQuestionsRef.current = recovery.askedQuestions;
                }
                if (recovery.knowledgeGraph) {
                  knowledgeGraphRef.current = recovery.knowledgeGraph;
                }

                // Phase 2 reconciliation: handle synced/delta/full statuses
                if (recovery.status === "delta" && Array.isArray(recovery.missingTurns)) {
                  const missingEntries = recovery.missingTurns.map(
                    (t: { role: string; content: string; timestamp: string }) => ({
                      role: t.role === "interviewer" || t.role === "model" ? "interviewer" as const : "candidate" as const,
                      content: t.content,
                      timestamp: t.timestamp,
                      finalized: true,
                    })
                  );
                  setTranscript((prev) => [...prev, ...missingEntries]);
                  console.log(`[Voice] Delta reconciliation: added ${missingEntries.length} missing turns`);
                } else if (recovery.status === "full" && recovery.canonicalTranscript) {
                  const serverTranscript = recovery.canonicalTranscript.map(
                    (t: { role: string; content: string; timestamp: string }) => ({
                      role: t.role === "interviewer" || t.role === "model" ? "interviewer" as const : "candidate" as const,
                      content: t.content,
                      timestamp: t.timestamp,
                      finalized: true,
                    })
                  );
                  setTranscript(serverTranscript);
                  console.log(`[Voice] Full reconciliation: replaced transcript with ${serverTranscript.length} canonical turns`);
                }
                // Restore enterprise fields from recovery
                if (recovery.moduleScores && Array.isArray(recovery.moduleScores)) {
                  moduleScoresRef.current = recovery.moduleScores;
                }
                if (recovery.enterpriseMemory) {
                  const em = recovery.enterpriseMemory;
                  if (em.flaggedFollowUps && Array.isArray(em.flaggedFollowUps)) {
                    flaggedFollowUpsRef.current = em.flaggedFollowUps;
                  }
                  if (em.candidateProfile) candidateProfileRef.current = em.candidateProfile;
                  if (em.currentDifficultyLevel) difficultyLevelRef.current = em.currentDifficultyLevel;
                  if (em.currentModule) currentModuleRef.current = em.currentModule;
                  if (em.interviewerState) interviewerStateRef.current = em.interviewerState;
                }

                // Transition: RECOVERY_PENDING → RECOVERY_CONFIRMED
                reconnectStateRef.current = transitionReconnectState("RECOVERY_PENDING", "RECOVERY_CONFIRMED");
                setReconnectPhase(stateToPhase(reconnectStateRef.current));
              } else {
                // Recovery API returned non-OK — BLOCK reconnect
                console.error("[Voice] Recovery API failed — blocking reconnect (fail-closed)");
                reconnectStateRef.current = "FAILED";
                setReconnectPhase(stateToPhase(reconnectStateRef.current));
                setConnectionQuality("poor");
                onErrorRef.current?.(`Unable to verify interview state. Please use this link to resume: /interview/${interviewId}?resume=true`);
                setIsReconnecting(false);
                return;
              }
            }
            // No reconnectToken — require server verification via voice-init
            if (!reconnectTokenRef.current) {
              reconnectStateRef.current = "RECOVERY_PENDING";
              setReconnectPhase(stateToPhase(reconnectStateRef.current));
            }

            // Step 2: Re-establish WebSocket (startInterview will check RECOVERY_CONFIRMED gate)
            await startInterview();
            // Transition: SOCKET_OPEN → LIVE (startInterview succeeded)
            try {
              reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "LIVE");
            } catch (err) {
              console.error(JSON.stringify({
                event: "reconnect_state_violation",
                from: reconnectStateRef.current,
                to: "LIVE",
                error: (err as Error).message,
                severity: "warning",
                timestamp: new Date().toISOString(),
              }));
              reconnectStateRef.current = "LIVE";
            }
            reconnectAttemptsRef.current = 0;
            setIsReconnecting(false);
            setReconnectPhase(null);
            setConnectionQuality("good");
            reportSLOEvent("session.reconnect.success_rate", true);
            reportSLOEvent("session.reconnect.context_loss.rate", true);
            // Record reconnect latency
            if (reconnectStartTimeRef.current > 0) {
              const latencyMs = Date.now() - reconnectStartTimeRef.current;
              console.log(`[Voice] Reconnect succeeded in ${latencyMs}ms`);
            }
          } catch {
            // Reconnect attempt failed — transition to FAILED
            reconnectStateRef.current = "FAILED";
            setReconnectPhase(stateToPhase(reconnectStateRef.current));
            setIsReconnecting(false);
            setConnectionQuality("poor");
            try { await checkpointTranscriptRef.current?.(); } catch { /* best-effort */ }
            setFallbackToText(true);
            onErrorRef.current?.("Connection lost. You can switch to text mode.");
            reportSLOEvent("session.reconnect.success_rate", false);
            reportSLOEvent("session.hard_stop.rate", false);
          }
        }, delay);
      };

      // 6. Send greeting or restore FULL context on reconnect
      const existingTranscript = transcriptRef.current;
      if (existingTranscript.length > 0) {
        // R5: Send FULL transcript to Gemini without lossy TOKEN_CHAR_BUDGET trimming.
        // Canonical ledger preserves all turns — no summarization needed.
        const hasKnowledgeGraph = knowledgeGraphRef.current && Object.keys(knowledgeGraphRef.current).length > 0;
        const MAX_ENTRY_CHARS = 12000; // Increased from 4000 — canonical ledger is source of truth

        const recentEntries = existingTranscript
          .filter((entry) => entry.content && typeof entry.content === "string" && entry.content.trim().length > 0);

        const totalChars = recentEntries.reduce((sum, e) => sum + Math.min(e.content.length, MAX_ENTRY_CHARS), 0);
        console.log(`[Voice] Reconnecting — restoring all ${recentEntries.length} entries (~${Math.round(totalChars / 4)} tokens)`);

        // Head+tail truncation: preserve question (start) and conclusion (end) — middle is lowest signal
        let truncatedCount = 0;
        const contextTurns = recentEntries.map((entry) => {
          let text = entry.content;
          if (text.length > MAX_ENTRY_CHARS) {
            truncatedCount++;
            const headChars = Math.floor(MAX_ENTRY_CHARS * 0.7);
            const tailChars = MAX_ENTRY_CHARS - headChars - 50;
            text = text.slice(0, headChars)
              + "\n[...truncated " + (text.length - MAX_ENTRY_CHARS) + " chars...]\n"
              + text.slice(-tailChars);
          }
          return {
            role: entry.role === "interviewer" ? "model" : "user",
            parts: [{ text }],
          };
        });
        if (truncatedCount > 0) {
          console.warn(`[Voice] Reconnect: ${truncatedCount} turns truncated at ${MAX_ENTRY_CHARS} chars`);
        }

        // Build reconnect context for Gemini
        const qCount = questionCountRef.current;
        const scores = moduleScoresRef.current;
        const scoresSummary = scores.length > 0
          ? scores.map((s) => `${s.module}: ${s.score}/10`).join(", ")
          : "none yet";
        // Include knowledge graph if available (LLM-extracted semantic memory)
        let knowledgeGraphBlock = "";
        if (hasKnowledgeGraph && knowledgeGraphRef.current) {
          const kg = knowledgeGraphRef.current;
          const kgParts: string[] = [];
          if (Array.isArray(kg.verified_claims) && kg.verified_claims.length) {
            kgParts.push(`Verified claims: ${(kg.verified_claims as string[]).slice(0, 10).join("; ")}`);
          }
          if (Array.isArray(kg.technical_stack) && kg.technical_stack.length) {
            kgParts.push(`Tech stack: ${(kg.technical_stack as string[]).join(", ")}`);
          }
          if (Array.isArray(kg.behavioral_signals) && kg.behavioral_signals.length) {
            kgParts.push(`Behavioral: ${(kg.behavioral_signals as string[]).slice(0, 5).join("; ")}`);
          }
          if (kgParts.length > 0) {
            knowledgeGraphBlock = `\n\nCANDIDATE KNOWLEDGE GRAPH:\n${kgParts.join("\n")}`;
          }
        }
        const summaryText = `[RECONNECT — SESSION RESUMED. Questions completed: ${qCount}. Modules scored: ${scoresSummary}. Total transcript entries: ${existingTranscript.length}. Difficulty: ${difficultyLevelRef.current}. DO NOT re-introduce yourself. DO NOT repeat any prior questions. Say "We're back, let's continue." and resume the conversation thread.${knowledgeGraphBlock}]`;

        ws.send(JSON.stringify({
          clientContent: {
            turns: [
              { role: "model", parts: [{ text: summaryText }] },
              ...contextTurns,
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
      // TODO [F11]: Migrate from ScriptProcessorNode (deprecated) to AudioWorklet.
      // AudioWorklet requires a separate worker file and MessagePort communication.
      // Deferred: not blocking enterprise readiness, but should be done for long-term support.
      const source = audioContext.createMediaStreamSource(micStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      audioProcessorErrorCountRef.current = 0; // F2: Reset error counter on new processor

      processor.onaudioprocess = (e) => {
        try { // F2: Error boundary — catch exceptions in audio processor
        if (!isMicEnabledRef.current) return;
        const ws2 = wsRef.current;
        if (!ws2 || ws2.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // ── Silence detection (only when AI is listening) ──
        // Skip during AI speaking/thinking — candidate is naturally quiet
        if (aiStateRef.current === "listening") {
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
        } else {
          // Reset counter during AI turns — don't accumulate
          silentFramesRef.current = 0;
          if (micIsSilent) setMicIsSilent(false);
        }

        // ── Backpressure: enqueue frames when WebSocket buffer is overloaded ──
        const pcm16 = float32ToPCM16(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

        if (ws2.bufferedAmount > 100_000) { // 100KB threshold
          // Enqueue instead of dropping — bounded ring buffer (max 50 frames ≈ 8.5s at 170ms/frame)
          if (audioQueueRef.current.length >= 50) {
            audioQueueRef.current.shift(); // Drop oldest frame
            droppedFramesRef.current += 1;
          }
          audioQueueRef.current.push(base64);
          if (audioQueueRef.current.length === 10) {
            setConnectionQuality("fair");
          } else if (droppedFramesRef.current >= 50) {
            setConnectionQuality("poor");
            console.warn("[Voice] Audio queue overflow — network severely congested");
          }
          return;
        }

        // WS is clear — send current frame
        const sendFrame = (data: string) => {
          ws2.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm;rate=24000",
                data,
              }],
            },
          }));
        };

        // Flush queued frames first (up to 5 per cycle to avoid burst)
        let flushed = 0;
        while (audioQueueRef.current.length > 0 && flushed < 5 && ws2.bufferedAmount < 100_000) {
          sendFrame(audioQueueRef.current.shift()!);
          flushed++;
        }
        if (flushed > 0 && audioQueueRef.current.length === 0) {
          droppedFramesRef.current = 0;
          setConnectionQuality("good");
        }

        sendFrame(base64);
        lastSendTimeRef.current = Date.now();
        } catch (err) { // F2: Error boundary catch
          audioProcessorErrorCountRef.current += 1;
          console.error("[Voice] Audio processor error:", err);
          if (audioProcessorErrorCountRef.current >= 2) {
            onError?.("Audio processing issue detected. Your mic may need attention.");
          }
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // 8. Start adaptive checkpoint timer
      // First 5 minutes: 15s intervals (opening context is critical)
      // After 5 minutes: 30s intervals (default)
      interviewStartTimeRef.current = interviewStartTimeRef.current || Date.now();
      const getCheckpointInterval = () => {
        const elapsed = Date.now() - interviewStartTimeRef.current;
        // Poor networks need MORE frequent checkpoints (smaller loss window), not less.
        const quality = connectionQuality;
        if (quality === "poor") return 10_000;   // 10s — minimize turn-loss window
        if (quality === "fair") return 15_000;   // 15s — same as early-session good
        return elapsed < 5 * 60 * 1000 ? 15_000 : CHECKPOINT_INTERVAL_MS;
      };
      const runAdaptiveCheckpoint = () => {
        lastCheckpointTimeRef.current = Date.now();
        checkpointTranscript();
        // Re-schedule with potentially different interval
        if (checkpointTimerRef.current) clearInterval(checkpointTimerRef.current);
        checkpointTimerRef.current = setInterval(runAdaptiveCheckpoint, getCheckpointInterval());
      };
      checkpointTimerRef.current = setInterval(runAdaptiveCheckpoint, getCheckpointInterval());

      // 9. Start heartbeat — detect dead connections proactively
      lastMessageTimeRef.current = Date.now();
      lastSendTimeRef.current = Date.now();
      heartbeatIntervalRef.current = setInterval(() => {
        const ws2 = wsRef.current;
        if (!ws2 || ws2.readyState !== WebSocket.OPEN) return;

        // F10: Keep-alive with valid PCM16 silence frame — send during idle AND candidate speech
        const sendGap = Date.now() - lastSendTimeRef.current;
        const candidateSpeaking = aiStateRef.current === "listening";
        if (sendGap > 25_000 || (candidateSpeaking && sendGap > 15_000)) {
          // 480 bytes of zeros = 240 PCM16 samples = 10ms of silence at 24kHz
          const silenceFrame = new Int16Array(240);
          const silenceBase64 = arrayBufferToBase64(silenceFrame.buffer as ArrayBuffer);
          ws2.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: "audio/pcm;rate=24000", data: silenceBase64 }],
            },
          }));
          lastSendTimeRef.current = Date.now();
        }

        const silenceMs = Date.now() - lastMessageTimeRef.current;
        // Only trigger heartbeat timeout when AI is truly idle — NOT during thinking/speaking/listening
        // Increased to 60s: Gemini processing + long candidate pauses can legitimately exceed 45s
        const aiIdle = aiStateRef.current === "idle";
        if (silenceMs > 60_000 && aiIdle && !tabHiddenRef.current) {
          console.warn("[Voice] Heartbeat timeout — no server message for 60s, triggering reconnect");
          intentionalCloseRef.current = false;
          ws2.close(4000, "Heartbeat timeout");
        }
      }, 20_000); // Check every 20s

      // 10. Start connection quality monitoring
      // AI-state-aware: don't flag "poor" when Gemini is naturally silent (speaking/processing/thinking)
      qualityCheckIntervalRef.current = setInterval(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (reconnectAttemptsRef.current > 0) return; // Skip during reconnect
        const gap = Date.now() - lastMessageTimeRef.current;
        const aiActive = aiStateRef.current === "speaking" || aiStateRef.current === "thinking";
        if (gap < 5_000) {
          setConnectionQuality("good");
          poorQualityCountRef.current = 0;
        } else if (gap < 15_000 || aiActive) {
          // During AI speaking/thinking, treat as "fair" at most (Gemini goes quiet naturally)
          setConnectionQuality(gap < 8_000 ? "good" : "fair");
          poorQualityCountRef.current = 0;
        } else {
          // Only set "poor" after 2 consecutive checks (debounce)
          poorQualityCountRef.current++;
          if (poorQualityCountRef.current >= 2) {
            setConnectionQuality("poor");
          }
        }
      }, 5_000); // Check every 5s

      setInterviewState("IN_PROGRESS");
      setIsConnected(true);
      setAiState("thinking");
      setConnectionQuality("good");
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      consecutiveSetupFailuresRef.current = 0; // Reset circuit breaker
      circuitBreakerStateRef.current = "CLOSED"; // F3: Reset circuit breaker state
      if (circuitBreakerTimerRef.current) { clearTimeout(circuitBreakerTimerRef.current); circuitBreakerTimerRef.current = null; }
    } catch (err) {
      console.error("Failed to start voice interview:", err);
      consecutiveSetupFailuresRef.current += 1;
      setInterviewState("ERROR");
      onError?.(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      isStartingRef.current = false; // Release mutex
    }
  }, [interviewId, accessToken, handleGeminiMessage, checkpointTranscript, reportSLOEvent, onError, cleanupAudioResources, micIsSilent]);

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
    reconnectAttemptsRef.current = 0;
    reconnectStartTimeRef.current = Date.now();

    // Transition: → DISCONNECTED → RECOVERY_PENDING
    try {
      if (reconnectStateRef.current === "LIVE" || reconnectStateRef.current === "SOCKET_OPEN") {
        reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current as "LIVE", "DISCONNECTED");
      }
      reconnectStateRef.current = transitionReconnectState("DISCONNECTED", "RECOVERY_PENDING");
      setReconnectPhase(stateToPhase(reconnectStateRef.current));
    } catch (err) {
      console.error(JSON.stringify({
        event: "reconnect_state_violation",
        from: reconnectStateRef.current,
        to: "RECOVERY_PENDING",
        error: (err as Error).message,
        severity: "warning",
        timestamp: new Date().toISOString(),
      }));
      reconnectStateRef.current = "RECOVERY_PENDING";
      setReconnectPhase("recovering");
    }

    try {
      // Call recovery API first for authoritative reconciliation
      if (reconnectTokenRef.current) {
        // Gap 2: Skip if another recovery call is already in-flight
        if (recoveryInFlightRef.current) {
          console.log("[Voice] Recovery already in-flight — skipping duplicate call");
          setIsReconnecting(false);
          return;
        }
        recoveryInFlightRef.current = true;
        // Gap 1: AbortController with 15s timeout
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 15000);
        let recoveryRes: Response;
        try {
          recoveryRes = await fetch(`/api/interviews/${interviewId}/voice/recover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              reconnectToken: reconnectTokenRef.current,
              clientLedgerVersion: ledgerVersionRef.current,
              clientStateHash: stateHashRef.current,
              lockOwnerToken: lockOwnerTokenRef.current,
              clientCheckpointDigest: lastCheckpointDigestRef.current,
              clientTurnIndex: transcriptRef.current.length - 1,
            }),
          });
        } finally {
          clearTimeout(abortTimeout);
          recoveryInFlightRef.current = false;
        }
        if (recoveryRes.ok) {
          const recovery = await recoveryRes.json();
          reconnectTokenRef.current = recovery.newReconnectToken;
          if (typeof recovery.ledgerVersion === "number") ledgerVersionRef.current = recovery.ledgerVersion;
          if (recovery.stateHash) stateHashRef.current = recovery.stateHash;
          introDoneRef.current = true;
          if (Array.isArray(recovery.askedQuestions)) {
            askedQuestionsRef.current = recovery.askedQuestions;
          }
          // Phase 2 reconciliation
          if (recovery.status === "delta" && Array.isArray(recovery.missingTurns)) {
            const missingEntries = recovery.missingTurns.map(
              (t: { role: string; content: string; timestamp: string }) => ({
                role: t.role === "interviewer" || t.role === "model" ? "interviewer" as const : "candidate" as const,
                content: t.content,
                timestamp: t.timestamp,
                finalized: true,
              })
            );
            setTranscript((prev) => [...prev, ...missingEntries]);
          } else if (recovery.status === "full" && recovery.canonicalTranscript) {
            const serverTranscript = recovery.canonicalTranscript.map(
              (t: { role: string; content: string; timestamp: string }) => ({
                role: t.role === "interviewer" || t.role === "model" ? "interviewer" as const : "candidate" as const,
                content: t.content,
                timestamp: t.timestamp,
                finalized: true,
              })
            );
            setTranscript(serverTranscript);
            if (recovery.moduleScores && Array.isArray(recovery.moduleScores)) {
              moduleScoresRef.current = recovery.moduleScores;
            }
          }
          // Transition: RECOVERY_PENDING → RECOVERY_CONFIRMED
          reconnectStateRef.current = transitionReconnectState("RECOVERY_PENDING", "RECOVERY_CONFIRMED");
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
        } else {
          // Recovery API failed — block reconnect (fail-closed)
          reconnectStateRef.current = "FAILED";
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
          setIsReconnecting(false);
          try { await checkpointTranscriptRef.current?.(); } catch { /* CF1: best-effort checkpoint before fallback */ }
          setFallbackToText(true);
          onError?.(`Unable to verify interview state. Please use this link to resume: /interview/${interviewId}?resume=true`);
          return;
        }
      } else {
        // No reconnect token — require server verification via voice-init
        reconnectStateRef.current = "RECOVERY_PENDING";
        setReconnectPhase(stateToPhase(reconnectStateRef.current));
      }

      // Step 2: Re-establish WebSocket
      setReconnectPhase("restoring");
      await startInterview();

      // Transition: SOCKET_OPEN → LIVE
      try {
        reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "LIVE");
      } catch (err) {
        console.error(JSON.stringify({
          event: "reconnect_state_violation",
          from: reconnectStateRef.current,
          to: "LIVE",
          error: (err as Error).message,
          severity: "warning",
          timestamp: new Date().toISOString(),
        }));
        reconnectStateRef.current = "LIVE";
      }
      setIsReconnecting(false);
      setReconnectPhase(null);
    } catch {
      reconnectStateRef.current = "FAILED";
      setReconnectPhase(stateToPhase(reconnectStateRef.current));
      setIsReconnecting(false);
      try { await checkpointTranscriptRef.current?.(); } catch { /* CF1: best-effort checkpoint before fallback */ }
      setFallbackToText(true);
      onError?.("Failed to reconnect. You can switch to text mode.");
    }
  }, [startInterview, interviewId, onError]);

  // F3: Retry voice after circuit breaker fallback — resets breaker and attempts reconnect
  const retryVoice = useCallback(async () => {
    // CF4: Rate-limit check before retry
    reconnectTimestampsRef.current.push(Date.now());
    if (shouldRateLimit(reconnectTimestampsRef.current)) {
      try {
        reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "DISCONNECTED");
      } catch { reconnectStateRef.current = "DISCONNECTED"; }
      try {
        reconnectStateRef.current = transitionReconnectState("DISCONNECTED", "RATE_LIMITED");
      } catch { reconnectStateRef.current = "RATE_LIMITED"; }
      setReconnectPhase(stateToPhase(reconnectStateRef.current));
      onError?.("Too many reconnect attempts. Please wait a moment before retrying, or switch to text mode.");
      return;
    }

    circuitBreakerStateRef.current = "HALF_OPEN";
    consecutiveSetupFailuresRef.current = 0;
    if (circuitBreakerTimerRef.current) { clearTimeout(circuitBreakerTimerRef.current); circuitBreakerTimerRef.current = null; }
    setFallbackToText(false);
    setIsReconnecting(true);
    setReconnectPhase("checking");

    try {
      // Gate: if we have a reconnect token, call recovery API first (fail-closed)
      const isReconnect = transcriptRef.current.length > 0;
      if (isReconnect && reconnectTokenRef.current) {
        // Gap 2: Skip if another recovery call is already in-flight
        if (recoveryInFlightRef.current) {
          console.log("[Voice] Recovery already in-flight — skipping duplicate call");
          setIsReconnecting(false);
          return;
        }
        recoveryInFlightRef.current = true;
        // CF4: Use proper state machine transition
        try {
          reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "RECOVERY_PENDING");
        } catch {
          reconnectStateRef.current = "RECOVERY_PENDING";
        }
        // Gap 1: AbortController with 15s timeout
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 15000);
        let recoveryRes: Response;
        try {
          recoveryRes = await fetch(`/api/interviews/${interviewId}/voice/recover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              reconnectToken: reconnectTokenRef.current,
              clientLedgerVersion: ledgerVersionRef.current,
              clientStateHash: stateHashRef.current,
              lockOwnerToken: lockOwnerTokenRef.current,
              clientCheckpointDigest: lastCheckpointDigestRef.current,
              clientTurnIndex: transcriptRef.current.length - 1,
            }),
          });
        } finally {
          clearTimeout(abortTimeout);
          recoveryInFlightRef.current = false;
        }
        if (recoveryRes.ok) {
          const recovery = await recoveryRes.json();
          reconnectTokenRef.current = recovery.newReconnectToken;
          if (typeof recovery.ledgerVersion === "number") ledgerVersionRef.current = recovery.ledgerVersion;
          if (recovery.stateHash) stateHashRef.current = recovery.stateHash;
          introDoneRef.current = true;
          // CF4: Use proper state machine transition
          try {
            reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "RECOVERY_CONFIRMED");
          } catch {
            reconnectStateRef.current = "RECOVERY_CONFIRMED";
          }
        } else {
          try {
            reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "FAILED");
          } catch {
            reconnectStateRef.current = "FAILED";
          }
          setReconnectPhase(stateToPhase(reconnectStateRef.current));
          setIsReconnecting(false);
          try { await checkpointTranscriptRef.current?.(); } catch { /* CF1: best-effort checkpoint before fallback */ }
          setFallbackToText(true);
          onError?.(`Unable to verify interview state. Please use this link to resume: /interview/${interviewId}?resume=true`);
          return;
        }
      } else if (isReconnect) {
        // No token but transcript exists — require server verification via voice-init
        try {
          reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "RECOVERY_PENDING");
        } catch {
          reconnectStateRef.current = "RECOVERY_PENDING";
        }
        setReconnectPhase(stateToPhase(reconnectStateRef.current));
      }

      await startInterview();
      // CF4: Use proper state machine transition to LIVE
      try {
        reconnectStateRef.current = transitionReconnectState(reconnectStateRef.current, "LIVE");
      } catch {
        reconnectStateRef.current = "LIVE";
      }
      setIsReconnecting(false);
      setReconnectPhase(null);
    } catch {
      setIsReconnecting(false);
      setReconnectPhase(null);
      circuitBreakerStateRef.current = "OPEN";
      consecutiveSetupFailuresRef.current = 3;
      try { await checkpointTranscriptRef.current?.(); } catch { /* CF1: best-effort checkpoint before fallback */ }
      setFallbackToText(true);
      onError?.("Voice retry failed. Staying in text mode.");
    }
  }, [startInterview, interviewId, onError]);

  // ── Emergency Transcript Save on Page Unload ─────────────────────
  // Prevents data loss if browser crashes or tab is closed between checkpoints.
  // sendBeacon is the only reliable API that survives page teardown.

  useEffect(() => {
    const emergencySave = () => {
      if (!transcriptRef.current.length || !accessToken) return;
      // Write to IndexedDB first — available on tab refresh recovery
      backupTranscript(
        interviewId,
        transcriptRef.current,
        moduleScoresRef.current,
        questionCountRef.current,
        {
          currentDifficultyLevel: difficultyLevelRef.current,
          flaggedFollowUps: flaggedFollowUpsRef.current,
          currentModule: currentModuleRef.current,
          candidateProfile: candidateProfileRef.current || undefined,
        }
      ).catch(() => {});
      // Also fire sendBeacon to server
      const payload = JSON.stringify({
        accessToken,
        action: "checkpoint",
        transcript: transcriptRef.current,
        moduleScores: moduleScoresRef.current,
        questionCount: questionCountRef.current,
        currentDifficultyLevel: difficultyLevelRef.current,
        flaggedFollowUps: flaggedFollowUpsRef.current,
        currentModule: currentModuleRef.current,
        candidateProfile: candidateProfileRef.current,
        askedQuestions: askedQuestionsRef.current.slice(0, 50),
      });
      navigator.sendBeacon(
        `/api/interviews/${interviewId}/voice`,
        new Blob([payload], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", emergencySave);
    window.addEventListener("pagehide", emergencySave);
    return () => {
      window.removeEventListener("beforeunload", emergencySave);
      window.removeEventListener("pagehide", emergencySave);
    };
  }, [interviewId, accessToken]);

  // ── Tab Refresh Recovery: Restore from IndexedDB on Mount ────────
  // If the page was refreshed mid-interview, IndexedDB may have a backup
  // from the last checkpoint or emergency save. Hydrate refs so startInterview()
  // detects this as a reconnect (transcriptRef.current.length > 0).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const backup = await getBackedUpTranscript(interviewId);
        if (cancelled || !backup) return;
        // Only restore if backup is recent (< 2 hours) and has data
        const age = Date.now() - backup.savedAt;
        if (age > 7200_000 || backup.transcript.length === 0) return;

        console.log(`[Voice] Restoring from IndexedDB: ${backup.transcript.length} entries, ${backup.questionCount} questions (age: ${Math.round(age / 1000)}s)`);
        const restored = backup.transcript.map((t) => ({
          role: t.role as "interviewer" | "candidate",
          content: t.content,
          timestamp: t.timestamp || new Date().toISOString(),
          finalized: t.finalized ?? true,
        }));
        transcriptRef.current = restored;
        setTranscript(restored);
        moduleScoresRef.current = backup.moduleScores || [];
        questionCountRef.current = backup.questionCount || 0;
        setQuestionCount(backup.questionCount || 0);
        // Extract asked questions from restored transcript for dedup
        askedQuestionsRef.current = restored
          .filter((e) => e.role === "interviewer" && e.content.includes("?"))
          .map((e) => e.content)
          .slice(-50);
        // Restore enterprise memory fields
        if (backup.currentDifficultyLevel) difficultyLevelRef.current = backup.currentDifficultyLevel;
        if (backup.flaggedFollowUps) flaggedFollowUpsRef.current = backup.flaggedFollowUps;
        if (backup.currentModule) currentModuleRef.current = backup.currentModule;
        if (backup.candidateProfile) candidateProfileRef.current = backup.candidateProfile;
        // R9: sessionSummary removed — ledger is authoritative
      } catch {
        // IndexedDB unavailable — proceed with fresh start
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

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
      // F3: Clear circuit breaker timer
      if (circuitBreakerTimerRef.current) { clearTimeout(circuitBreakerTimerRef.current); circuitBreakerTimerRef.current = null; }
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]);

  // CF1: Export full session state for text-mode fallback continuity
  const getSessionSnapshot = useCallback((): SessionSnapshot => ({
    transcript: transcriptRef.current,
    moduleScores: moduleScoresRef.current,
    questionCount: questionCountRef.current,
    interviewerState: interviewerStateRef.current,
    ledgerVersion: ledgerVersionRef.current,
    stateHash: stateHashRef.current,
    reconnectToken: reconnectTokenRef.current,
    askedQuestions: askedQuestionsRef.current,
    currentModule: currentModuleRef.current,
    candidateProfile: candidateProfileRef.current,
    difficultyLevel: difficultyLevelRef.current,
  }), []);

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
    reconnectAttempt: reconnectAttemptsRef.current,
    reconnectMax: getMaxReconnectAttempts(lastCloseCodeRef.current),
    micIsSilent,
    startInterview,
    endInterview,
    sendTextMessage,
    toggleMic,
    isMicEnabled,
    reconnect,
    retryVoice,
    pauseInterview,
    resumeInterview,
    getSessionSnapshot,
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

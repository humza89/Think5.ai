"use client";

/**
 * VoiceInterviewRoom — Micro1-style Voice + Video Interview UI
 *
 * Layout: AI avatar/waveform (left) + candidate webcam (right) + transcript panel
 * Features: real-time voice conversation, video recording, proctoring, accessibility fallback
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Send,
  Bot,
  User,
  Clock,
  MessageSquare,
  Wifi,
  WifiOff,
  AlertTriangle,
  Maximize2,
  Volume2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useVoiceInterview,
  type InterviewState,
  type AISpeakingState,
  type TranscriptEntry,
} from "@/hooks/useVoiceInterview";

// ── Props ──────────────────────────────────────────────────────────────

interface VoiceInterviewRoomProps {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  accessToken: string;
  durationMinutes?: number;
}

// ── Component ──────────────────────────────────────────────────────────

export function VoiceInterviewRoom({
  interviewId,
  candidateName,
  jobTitle,
  accessToken,
  durationMinutes = 30,
}: VoiceInterviewRoomProps) {
  const router = useRouter();

  // Video states
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<number>(0);

  // Reconnection state
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const prevConnectedRef = useRef(true);

  // Recording failure tracking
  const failedChunksRef = useRef<number>(0);
  const [recordingWarning, setRecordingWarning] = useState(false);

  // UI states
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Voice interview hook
  const {
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
  } = useVoiceInterview({
    interviewId,
    accessToken,
    onError: (error) => toast.error(error),
    onInterviewEnd: () => {
      toast.success("Interview completed! Generating your report...");
      // Finalize recording
      finalizeRecording();
      // Redirect after delay
      setTimeout(() => {
        router.push(`/candidate/interviews/${interviewId}/report`);
      }, 3000);
    },
  });

  // ── Camera Setup ─────────────────────────────────────────────────

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const initCamera = async () => {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false, // Audio is handled by useVoiceInterview
        });
        setStream(currentStream);
        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
        }

        // Initialize recording
        const fullStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        try {
          const recorder = new MediaRecorder(fullStream, {
            mimeType: "video/webm;codecs=vp9",
          });
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
              await uploadChunk(event.data, recordedChunksRef.current);
              recordedChunksRef.current++;
            }
          };

          recorder.start(2000); // 2-second chunks
        } catch {
          // VP9 not supported, try default
          const recorder = new MediaRecorder(fullStream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
              await uploadChunk(event.data, recordedChunksRef.current);
              recordedChunksRef.current++;
            }
          };
          recorder.start(2000);
        }
      } catch {
        toast.error("Could not access camera. Please check permissions.");
      }
    };

    initCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ── Timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          endInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [interviewState, endInterview]);

  // ── Auto-scroll transcript ───────────────────────────────────────

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ── Reconnection Detection ──────────────────────────────────────

  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;

    if (!isConnected && prevConnectedRef.current) {
      // Lost connection
      setIsReconnecting(true);
      setReconnectAttempt((prev) => prev + 1);
    } else if (isConnected && !prevConnectedRef.current) {
      // Reconnected
      setIsReconnecting(false);
      toast.success("Connection restored");
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, interviewState]);

  // ── Recording Upload ─────────────────────────────────────────────

  const uploadChunk = async (blob: Blob, index: number, type?: string) => {
    try {
      const formData = new FormData();
      formData.append("chunk", blob);
      formData.append("chunkIndex", String(index));
      formData.append("accessToken", accessToken);
      if (type) {
        formData.append("type", type);
      }

      await fetch(`/api/interviews/${interviewId}/recording`, {
        method: "POST",
        body: formData,
      });
      // Reset consecutive failure counter on success
      failedChunksRef.current = 0;
    } catch {
      failedChunksRef.current++;
      if (failedChunksRef.current >= 3) {
        setRecordingWarning(true);
      }
    }
  };

  const finalizeRecording = async () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    try {
      await fetch(`/api/interviews/${interviewId}/recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          totalChunks: recordedChunksRef.current,
          format: "webm",
          durationSeconds: durationMinutes * 60 - timeLeft,
        }),
      });
    } catch {
      // Silent fail
    }
  };

  // ── Camera Toggle ────────────────────────────────────────────────

  const toggleCamera = useCallback(() => {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCameraEnabled((prev) => !prev);
    }
  }, [stream]);

  // ── Text Fallback ────────────────────────────────────────────────

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    sendTextMessage(textInput.trim());
    setTextInput("");
  };

  // ── Fullscreen ───────────────────────────────────────────────────

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // ── Time Format ──────────────────────────────────────────────────

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render ───────────────────────────────────────────────────────

  // Pre-interview state
  if (interviewState === "IDLE" || interviewState === "CONNECTING") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Ready to Begin?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ll be speaking with Aria, our AI interviewer, for approximately{" "}
            {durationMinutes} minutes about the <strong>{jobTitle}</strong> role.
          </p>

          <div className="mt-4 space-y-2 text-left text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Mic className="h-4 w-4" /> Your microphone and camera will be used
            </p>
            <p className="flex items-center gap-2">
              <Video className="h-4 w-4" /> This interview will be recorded
            </p>
            <p className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Speak naturally — Aria will adapt to you
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            By starting this interview, you consent to audio/video recording,
            transcription, and AI-based evaluation.
          </div>

          <Button
            onClick={startInterview}
            className="mt-6 w-full"
            size="lg"
            disabled={interviewState === "CONNECTING"}
          >
            {interviewState === "CONNECTING" ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Connecting...
              </>
            ) : (
              "Start Interview"
            )}
          </Button>
        </Card>
      </div>
    );
  }

  // Completed state
  if (interviewState === "COMPLETED") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <Bot className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">Interview Complete!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you, {candidateName}. Your interview has been recorded and a
            detailed report is being generated.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            You&apos;ll be redirected to your results shortly...
          </p>
          <div className="mt-4">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Active interview
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Aria Interview</p>
            <p className="text-xs text-muted-foreground">{jobTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Question count */}
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            Q{questionCount}
          </Badge>

          {/* Timer */}
          <Badge
            variant={timeLeft < 300 ? "destructive" : "secondary"}
            className="gap-1 tabular-nums"
          >
            <Clock className="h-3 w-3" />
            {formatTime(timeLeft)}
          </Badge>

          {/* Connection quality */}
          <Badge
            variant="secondary"
            className={`gap-1 ${
              connectionQuality === "good"
                ? "text-green-500"
                : connectionQuality === "fair"
                  ? "text-yellow-500"
                  : "text-red-500"
            }`}
          >
            {connectionQuality === "poor" ? (
              <WifiOff className="h-3 w-3" />
            ) : (
              <Wifi className="h-3 w-3" />
            )}
          </Badge>

          {/* Fullscreen */}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>

          {/* End interview */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Are you sure you want to end the interview?")) {
                endInterview();
              }
            }}
          >
            <PhoneOff className="h-4 w-4 mr-1" />
            End
          </Button>
        </div>
      </header>

      {/* ── Reconnection Overlay ── */}
      {isReconnecting && (
        <div className="flex items-center gap-2 bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-sm text-orange-700 dark:text-orange-400">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            Connection lost — reconnecting{reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ""}...
            Your responses are saved.
          </span>
        </div>
      )}

      {/* ── Recording Warning ── */}
      {recordingWarning && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Recording may be incomplete due to upload issues
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: AI Avatar + Candidate Video ── */}
        <div className="flex w-2/3 flex-col gap-4 p-4">
          <div className="flex flex-1 gap-4">
            {/* AI Avatar Panel */}
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border">
              <AIAvatar state={aiState} />
              <p className="mt-3 text-sm font-medium">Aria</p>
              <p className="text-xs text-muted-foreground">
                {aiState === "speaking"
                  ? "Speaking..."
                  : aiState === "thinking"
                    ? "Thinking..."
                    : aiState === "listening"
                      ? "Listening..."
                      : "Ready"}
              </p>
            </div>

            {/* Candidate Video */}
            <div className="relative flex-1 overflow-hidden rounded-xl bg-muted border">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {!cameraEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <User className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Camera off</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2">
                <Badge variant="secondary" className="text-xs">
                  {candidateName}
                </Badge>
              </div>

            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant={isMicEnabled ? "secondary" : "destructive"}
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={toggleMic}
            >
              {isMicEnabled ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </Button>

            <Button
              variant={cameraEnabled ? "secondary" : "destructive"}
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={toggleCamera}
            >
              {cameraEnabled ? (
                <Video className="h-5 w-5" />
              ) : (
                <VideoOff className="h-5 w-5" />
              )}
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => setShowTextInput(!showTextInput)}
              title="Text input (accessibility fallback)"
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
          </div>

          {/* Text Input Fallback */}
          {showTextInput && (
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your response..."
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
              />
              <Button onClick={handleTextSubmit} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* ── Right: Transcript Panel ── */}
        <div className="flex w-1/3 flex-col border-l">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-medium">Live Transcript</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.map((entry, i) => (
              <TranscriptBubble key={i} entry={entry} />
            ))}
            {aiState === "thinking" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                </div>
                Aria is thinking...
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Avatar Component ────────────────────────────────────────────────

function AIAvatar({ state }: { state: AISpeakingState }) {
  return (
    <div className="relative">
      {/* Outer ring animation */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-500 ${
          state === "speaking"
            ? "animate-ping bg-primary/20"
            : state === "listening"
              ? "animate-pulse bg-blue-500/10"
              : state === "thinking"
                ? "animate-pulse bg-yellow-500/10"
                : ""
        }`}
        style={{ transform: "scale(1.3)" }}
      />

      {/* Main avatar circle */}
      <div
        className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300 ${
          state === "speaking"
            ? "bg-primary/20 ring-4 ring-primary/30"
            : state === "listening"
              ? "bg-blue-500/10 ring-2 ring-blue-500/20"
              : state === "thinking"
                ? "bg-yellow-500/10 ring-2 ring-yellow-500/20"
                : "bg-muted ring-1 ring-border"
        }`}
      >
        {state === "speaking" ? (
          <Volume2 className="h-10 w-10 text-primary animate-pulse" />
        ) : state === "thinking" ? (
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        ) : (
          <Bot className="h-10 w-10 text-primary" />
        )}
      </div>
    </div>
  );
}

// ── Transcript Bubble ──────────────────────────────────────────────────

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  if (entry.content === "__turn_complete__") return null;

  const isInterviewer = entry.role === "interviewer";

  return (
    <div className={`flex gap-2 ${isInterviewer ? "" : "flex-row-reverse"}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isInterviewer ? "bg-primary/10" : "bg-muted"
        }`}
      >
        {isInterviewer ? (
          <Bot className="h-3 w-3 text-primary" />
        ) : (
          <User className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isInterviewer
            ? "bg-primary/5 text-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {entry.content}
      </div>
    </div>
  );
}

"use client";

/**
 * VoiceInterviewRoom — Mercor/Micro1-style immersive interview UI
 *
 * Full-screen candidate video, Think5 AI indicator in corner,
 * floating control bar, device selectors, transcript panel on right.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import {
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Bot,
  User,
  MessageSquare,
  AlertTriangle,
  Pause,
  Play,
  Loader2,
  X,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useVoiceInterview,
  type AISpeakingState,
  type TranscriptEntry,
} from "@/hooks/useVoiceInterview";
import { DeviceSelector } from "@/components/interview/DeviceSelector";

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
  const prevConnectedRef = useRef(true);

  // Recording failure tracking
  const failedChunksRef = useRef<number>(0);
  const [recordingWarning, setRecordingWarning] = useState(false);

  // UI states
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [showControls, setShowControls] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Accessibility
  const [srAnnouncement, setSrAnnouncement] = useState("");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [degradationBannerShown, setDegradationBannerShown] = useState(false);
  const degradationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const draftKeyRef = useRef(`draft-response:${interviewId}`);

  // Voice interview hook
  const {
    interviewState,
    aiState,
    transcript,
    isConnected,
    questionCount,
    connectionQuality,
    isReconnecting: voiceReconnecting,
    isPaused,
    startInterview,
    endInterview,
    sendTextMessage,
    toggleMic,
    isMicEnabled,
    reconnect,
    pauseInterview,
    resumeInterview,
    fallbackToText,
    micIsSilent,
    retryVoice,
  } = useVoiceInterview({
    interviewId,
    accessToken,
    onError: (error) => toast.error(error),
    onInterviewEnd: () => {
      toast.success("Interview completed! Generating your report...");
      finalizeRecording();
      setTimeout(() => {
        router.push(`/candidate/interviews/${interviewId}/report`);
      }, 3000);
    },
  });

  // Auto-show text input when voice falls back to text mode
  useEffect(() => {
    if (fallbackToText) setShowTextInput(true);
  }, [fallbackToText]);

  // ── Device switching handlers ──────────────────────────────────────
  const handleMicChange = useCallback(async (deviceId: string) => {
    try {
      // Get new mic stream
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      // If there's an active MediaRecorder using audio, we'd need to restart it
      // For now, the voice hook handles mic through its own getUserMedia call
      // This primarily affects the next reconnect cycle
      toast.success("Microphone switched");
      newStream.getTracks().forEach((t) => t.stop()); // cleanup — hook will pick up on reconnect
    } catch {
      toast.error("Failed to switch microphone");
    }
  }, []);

  const handleCameraChange = useCallback(async (deviceId: string) => {
    try {
      // Stop old video tracks
      if (stream) {
        stream.getVideoTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) videoRef.current.srcObject = newStream;

      // SECURITY/F18: Update recording stream's video track if actively recording
      if (mediaRecorderRef.current?.state === "recording") {
        const recorderStream = mediaRecorderRef.current.stream;
        const oldVideoTrack = recorderStream.getVideoTracks()[0];
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (oldVideoTrack && newVideoTrack) {
          recorderStream.removeTrack(oldVideoTrack);
          recorderStream.addTrack(newVideoTrack.clone());
          oldVideoTrack.stop();
        }
      }

      toast.success("Camera switched");
    } catch {
      toast.error("Failed to switch camera");
    }
  }, [stream]);

  const handleSpeakerChange = useCallback(async (deviceId: string) => {
    // setSinkId is only available on some browsers (Chrome/Edge)
    try {
      const audioElements = document.querySelectorAll("audio");
      for (const el of audioElements) {
        if ("setSinkId" in el) {
          await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
        }
      }
      toast.success("Speaker switched");
    } catch {
      toast.error("Speaker switching not supported in this browser");
    }
  }, []);

  // ── Auto-start ────────────────────────────────────────────────────
  useEffect(() => {
    if (interviewState === "IDLE") startInterview();
  }, [interviewState, startInterview]);

  // ── Reduced Motion ────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Screen Reader Announcements ─────────────────────────────────
  useEffect(() => {
    if (interviewState === "IN_PROGRESS") setSrAnnouncement("Interview started. Aria is ready.");
    else if (interviewState === "COMPLETED") setSrAnnouncement("Interview completed.");
  }, [interviewState]);

  useEffect(() => {
    if (aiState === "speaking") setSrAnnouncement("Aria is speaking.");
    else if (aiState === "listening") setSrAnnouncement("Aria is listening. You may respond now.");
  }, [aiState]);

  useEffect(() => {
    if (connectionQuality === "poor") setSrAnnouncement("Connection quality is poor.");
  }, [connectionQuality]);

  // ── Keyboard Shortcuts ──────────────────────────────────────────
  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      switch (e.key) {
        case " ": e.preventDefault(); toggleMic(); break;
        case "Escape": e.preventDefault(); if (confirm("End the interview?")) endInterview(); break;
        case "t": case "T": e.preventDefault(); setShowTextInput((p) => !p); break;
        case "p": case "P": e.preventDefault(); isPaused ? resumeInterview() : pauseInterview(); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interviewState, isPaused, toggleMic, endInterview, pauseInterview, resumeInterview]);

  // ── Progressive Degradation ─────────────────────────────────────
  useEffect(() => {
    if (connectionQuality === "fair" || connectionQuality === "poor") {
      if (!degradationTimerRef.current) {
        degradationTimerRef.current = setTimeout(() => setDegradationBannerShown(true), 10000);
      }
    } else {
      if (degradationTimerRef.current) { clearTimeout(degradationTimerRef.current); degradationTimerRef.current = null; }
      setDegradationBannerShown(false);
    }
    return () => { if (degradationTimerRef.current) clearTimeout(degradationTimerRef.current); };
  }, [connectionQuality]);

  // ── Draft Auto-Save ─────────────────────────────────────────────
  useEffect(() => {
    if (!showTextInput) return;
    const saved = localStorage.getItem(draftKeyRef.current);
    if (saved && !textInput) setTextInput(saved);
  }, [showTextInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showTextInput || !textInput) return;
    const timeout = setTimeout(() => localStorage.setItem(draftKeyRef.current, textInput), 500);
    return () => clearTimeout(timeout);
  }, [textInput, showTextInput]);

  // ── Camera Setup ──────────────────────────────────────────────────
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    const initCamera = async () => {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        setStream(currentStream);
        setCameraEnabled(true);

        const fullStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        try {
          const recorder = new MediaRecorder(fullStream, { mimeType: "video/webm;codecs=vp9" });
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = async (event) => {
            if (event.data.size > 0) { await uploadChunk(event.data, recordedChunksRef.current); recordedChunksRef.current++; }
          };
          recorder.start(2000);
        } catch {
          const recorder = new MediaRecorder(fullStream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = async (event) => {
            if (event.data.size > 0) { await uploadChunk(event.data, recordedChunksRef.current); recordedChunksRef.current++; }
          };
          recorder.start(2000);
        }
      } catch {
        toast.error("Camera access is required. Please enable your camera and refresh.");
      }
    };
    initCamera();
    return () => {
      if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream, interviewState]);

  // ── Timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => { if (prev <= 0) { endInterview(); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [interviewState, endInterview]);

  // ── Auto-scroll transcript ─────────────────────────────────────
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript]);

  // ── Reconnection Detection ────────────────────────────────────
  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;
    if (!isConnected && prevConnectedRef.current) { setIsReconnecting(true); }
    else if (isConnected && !prevConnectedRef.current) { setIsReconnecting(false); toast.success("Connection restored"); }
    prevConnectedRef.current = isConnected;
  }, [isConnected, interviewState]);

  // ── Auto-hide controls ────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 5000);
  }, []);

  useEffect(() => {
    if (interviewState !== "IN_PROGRESS") return;
    resetControlsTimer();
    const handleMove = () => resetControlsTimer();
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [interviewState, resetControlsTimer]);

  // ── Upload & Recording ────────────────────────────────────────
  // F7: Upload with retry (3 attempts, 1s delay between each)
  const uploadChunk = async (blob: Blob, index: number) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const formData = new FormData();
        formData.append("chunk", blob);
        formData.append("chunkIndex", String(index));
        formData.append("accessToken", accessToken);
        await fetch(`/api/interviews/${interviewId}/recording`, { method: "POST", body: formData });
        failedChunksRef.current = 0;
        setRecordingWarning(false);
        return; // Success
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    // All 3 attempts failed
    failedChunksRef.current++;
    if (failedChunksRef.current >= 3) setRecordingWarning(true);
  };

  const finalizeRecording = async () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    try {
      await fetch(`/api/interviews/${interviewId}/recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", totalChunks: recordedChunksRef.current, format: "webm", durationSeconds: durationMinutes * 60 - timeLeft }),
      });
    } catch { /* silent */ }
  };

  const toggleCamera = useCallback(() => {
    if (stream) {
      stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
      setCameraEnabled((p) => !p);
    }
  }, [stream]);

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    sendTextMessage(textInput.trim());
    setTextInput("");
    localStorage.removeItem(draftKeyRef.current);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const elapsedSeconds = durationMinutes * 60 - timeLeft;
  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Loading / Completed states ────────────────────────────────

  if (interviewState === "IDLE" || interviewState === "CONNECTING") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-sm text-gray-400">Connecting to Aria...</p>
        </div>
      </div>
    );
  }

  // F9: ERROR state UI — show recovery card
  if (interviewState === "ERROR") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Card className="max-w-md p-8 text-center bg-gray-900 border-gray-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-white">Something Went Wrong</h2>
          <p className="mt-2 text-sm text-gray-400">
            The interview encountered an error. You can try reconnecting or contact support.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => retryVoice()} className="w-full" size="lg">
              Retry Connection
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full" size="lg">
              Refresh Page
            </Button>
            <a href="mailto:support@think5.io" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Contact Support
            </a>
          </div>
        </Card>
      </div>
    );
  }

  if (interviewState === "COMPLETED") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Card className="max-w-md p-8 text-center bg-gray-900 border-gray-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <Bot className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold text-white">Interview Complete!</h2>
          <p className="mt-2 text-sm text-gray-400">
            Thank you, {candidateName}. Your report is being generated.
          </p>
          <div className="mt-4">
            <div className="h-1 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full animate-pulse rounded-full bg-blue-500" style={{ width: "60%" }} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Active Interview Layout ───────────────────────────────────

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Screen reader announcements */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">{srAnnouncement}</div>

      {/* ── Main Video Area ── */}
      <div className="relative flex-1 flex flex-col">

        {/* Alert banners (overlaid on top of video) */}
        <div className="absolute top-0 left-0 right-0 z-30 flex flex-col">
          {voiceReconnecting && (
            <div className="flex items-center justify-between gap-2 bg-orange-500/90 px-4 py-2 text-sm text-white">
              <span>Reconnecting... Your responses are saved.</span>
              <div className="flex gap-2">
                <button onClick={reconnect} className="underline text-xs">Retry</button>
                <button onClick={() => setShowTextInput(true)} className="underline text-xs">Text Mode</button>
              </div>
            </div>
          )}
          {micIsSilent && isMicEnabled && interviewState === "IN_PROGRESS" && (
            <div className="flex items-center gap-2 bg-red-500/90 px-4 py-2 text-sm text-white">
              <AlertTriangle className="h-4 w-4" />
              Mic appears muted — check your mic settings
            </div>
          )}
          {degradationBannerShown && connectionQuality === "poor" && (
            <div className="flex items-center gap-2 bg-orange-500/80 px-4 py-2 text-sm text-white">
              <AlertTriangle className="h-4 w-4" />
              Connection unstable. Consider text mode.
            </div>
          )}
          {fallbackToText && (
            <div className="flex items-center justify-between gap-2 bg-blue-500/90 px-4 py-2 text-sm text-white">
              <span>Voice lost. Continue by typing below.</span>
              {/* F3: Retry Voice button — allows recovery from circuit breaker */}
              <button onClick={() => retryVoice()} className="underline text-xs font-medium hover:text-white/80">
                Retry Voice
              </button>
            </div>
          )}
          {/* F7: Recording upload warning banner */}
          {recordingWarning && (
            <div className="flex items-center gap-2 bg-yellow-500/90 px-4 py-2 text-sm text-white">
              <AlertTriangle className="h-4 w-4" />
              Recording upload issues — some segments may not be saved.
            </div>
          )}
        </div>

        {/* Full-screen candidate video */}
        <div className="relative flex-1 bg-gray-900 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          {!cameraEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <User className="mx-auto h-16 w-16 text-gray-600" />
                <p className="mt-3 text-sm text-gray-500">Camera off</p>
              </div>
            </div>
          )}

          {/* Recording indicator — top left */}
          {interviewState === "IN_PROGRESS" && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-xs text-white/90 font-medium">REC</span>
              <span className="text-xs text-white/60 tabular-nums">{formatElapsed(elapsedSeconds)}</span>
            </div>
          )}

          {/* Timer + Question count — top right */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <div className={`rounded-full px-3 py-1.5 text-xs tabular-nums font-medium backdrop-blur-sm ${
              timeLeft < 300 ? "bg-red-500/80 text-white" : "bg-black/60 text-white/90"
            }`}>
              {formatTime(timeLeft)} left
            </div>
            <div className="rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 text-xs text-white/90 font-medium">
              Q{questionCount}
            </div>
            {/* Toggle transcript button */}
            {!showTranscript && (
              <button
                onClick={() => setShowTranscript(true)}
                className="rounded-full bg-black/60 backdrop-blur-sm p-2 text-white/70 hover:text-white transition-colors"
                title="Show transcript"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Think5 AI Indicator — bottom left (like Micro1's "m." logo) */}
          <div className="absolute bottom-24 left-4 z-20">
            <AriaIndicator state={aiState} reducedMotion={prefersReducedMotion} />
          </div>

          {/* Candidate name — bottom right */}
          <div className="absolute bottom-24 right-4 z-20 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5">
            <span className="text-sm text-white font-medium">{candidateName}</span>
            <span className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-white/50" />
              <span className="h-1 w-1 rounded-full bg-white/50" />
              <span className="h-1 w-1 rounded-full bg-white/50" />
            </span>
          </div>

          {/* ── Floating Control Bar — bottom center ── */}
          <div
            className={`absolute bottom-0 left-0 right-0 z-20 transition-all duration-300 ${
              showControls ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
            }`}
            onMouseEnter={() => setShowControls(true)}
          >
            <div className="mx-auto max-w-3xl px-4 pb-4">
              <div className="flex items-center justify-between rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 px-4 py-3">
                {/* Left: Device selectors */}
                <DeviceSelector
                  onMicChange={handleMicChange}
                  onCameraChange={handleCameraChange}
                  onSpeakerChange={handleSpeakerChange}
                />

                {/* Center: Control buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                      isMicEnabled
                        ? "bg-white/10 hover:bg-white/20 text-white"
                        : "bg-red-500 hover:bg-red-600 text-white"
                    }`}
                    title={isMicEnabled ? "Mute mic (Space)" : "Unmute mic (Space)"}
                  >
                    {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>

                  <button
                    onClick={pauseInterview}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Pause (P)"
                  >
                    <Pause className="h-5 w-5" />
                  </button>

                  <button
                    onClick={() => setShowTextInput((p) => !p)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                      showTextInput
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    }`}
                    title="Text mode (T)"
                  >
                    <MessageSquare className="h-5 w-5" />
                  </button>

                  <button
                    onClick={() => { if (confirm("End the interview?")) endInterview(); }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                    title="End interview (Esc)"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>

                {/* Right: Connection quality dot */}
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${
                    connectionQuality === "good" ? "bg-green-500" :
                    connectionQuality === "fair" ? "bg-yellow-500" : "bg-red-500"
                  }`} />
                  <span className="text-xs text-white/50">{connectionQuality}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Text input bar (shown above control bar when active) */}
          {showTextInput && (
            <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
              <div className="mx-auto max-w-2xl">
                <div className="flex gap-2 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 p-2">
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your response..."
                    onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                    className="bg-transparent border-0 text-white placeholder:text-white/40 focus-visible:ring-0"
                  />
                  <Button onClick={handleTextSubmit} size="icon" variant="ghost" className="text-white hover:bg-white/10">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pause Overlay */}
        {isPaused && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <Card className="max-w-sm p-8 text-center bg-gray-900 border-gray-800">
              <Pause className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Interview Paused</h2>
              <p className="text-sm text-gray-400 mb-6">
                Auto-cancels after 10 minutes of pause.
              </p>
              <Button onClick={resumeInterview} className="w-full" size="lg" autoFocus>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* ── Transcript Panel — Right Side ── */}
      {showTranscript && (
        <div className="flex w-[340px] flex-col border-l border-white/10 bg-gray-950">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Live Transcript</h3>
            <button
              onClick={() => setShowTranscript(false)}
              className="rounded-md p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Close transcript"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Transcript content */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            role="log"
            aria-live="polite"
            aria-label="Interview transcript"
          >
            {transcript
              .filter((entry) => entry.role === "interviewer")
              .map((entry, i) => (
              <TranscriptBubble key={i} entry={entry} candidateName={candidateName} />
            ))}
            {aiState === "thinking" && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "300ms" }} />
                </div>
                Aria is thinking...
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Think5 AI Indicator (corner avatar like Micro1's "m.") ──────────

function AriaIndicator({ state, reducedMotion = false }: { state: AISpeakingState; reducedMotion?: boolean }) {
  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";

  const glowStyle: React.CSSProperties = isSpeaking
    ? {
        boxShadow:
          "0 0 20px 5px rgba(59,130,246,0.6), 0 0 60px 20px rgba(59,130,246,0.3), 0 0 120px 40px rgba(59,130,246,0.15)",
        transition: "box-shadow 0.5s ease",
      }
    : isThinking
    ? {
        boxShadow:
          "0 0 15px 5px rgba(59,130,246,0.3), 0 0 40px 15px rgba(59,130,246,0.15)",
        transition: "box-shadow 0.5s ease",
      }
    : {
        boxShadow: "none",
        transition: "box-shadow 0.5s ease",
      };

  return (
    <div role="img" aria-label={`Aria is ${state}`}>
      <div
        className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-white overflow-hidden ${
          isThinking && !reducedMotion ? "animate-pulse" : ""
        }`}
        style={glowStyle}
      >
        <Image
          src="/Logos/think5 logo.png"
          alt="Think5 AI"
          width={200}
          height={200}
          unoptimized
          className="w-[80%] h-auto object-contain"
        />
      </div>
    </div>
  );
}

// ── Transcript Bubble (Micro1-style) ─────────────────────────────────

function TranscriptBubble({ entry, candidateName }: { entry: TranscriptEntry; candidateName: string }) {
  if (entry.content === "__turn_complete__") return null;
  const isAria = entry.role === "interviewer";

  return (
    <div className={`flex flex-col ${isAria ? "items-start" : "items-end"}`}>
      {/* Name label */}
      <span className={`text-xs font-medium mb-1 ${isAria ? "text-gray-400" : "text-blue-400"}`}>
        {isAria ? "Aria" : candidateName}
      </span>
      {/* Bubble */}
      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isAria
          ? "bg-gray-800/80 text-gray-200"
          : "bg-blue-600/80 text-white"
      }`}>
        {entry.content}
      </div>
    </div>
  );
}

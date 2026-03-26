"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { useProctoring, type ProctoringConfig } from "@/hooks/useProctoring";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { InterviewHeader } from "@/components/interview/InterviewHeader";
import { WelcomeScreen } from "@/components/interview/WelcomeScreen";
import { AriaPanel } from "@/components/interview/AriaPanel";
import { CandidatePanel } from "@/components/interview/CandidatePanel";
import { InterviewComplete } from "@/components/interview/InterviewComplete";
import { ProctoringOverlay } from "@/components/interview/ProctoringOverlay";
import { VoiceInterviewRoom } from "@/components/interview/VoiceInterviewRoom";
import { InterviewPreCheck } from "@/components/interview/InterviewPreCheck";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { useMediaRecording } from "@/hooks/useMediaRecording";

type InterviewStage =
  | "LOADING"
  | "READINESS"
  | "WELCOME"
  | "RESUMING"
  | "ACTIVE"
  | "CLOSING"
  | "COMPLETE";

interface InterviewMeta {
  id: string;
  type: string;
  status: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateImage: string | null;
  hasTranscript: boolean;
  duration: number;
  voiceProvider?: string | null;
  jobTitle?: string | null;
  durationMinutes?: number;
  proctoringLevel?: "none" | "light" | "strict";
  pastePolicy?: "allow" | "warn" | "block";
  maxPasteWarnings?: number;
  readinessRequired?: boolean;
  readinessVerified?: boolean;
  screenShareRequired?: boolean;
  templateMode?: string | null;
  candidateReportPolicy?: Record<string, boolean> | null;
  isPractice?: boolean;
}

const MAX_DURATION_MS = 45 * 60 * 1000; // 45 minutes

export default function InterviewRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  const accessToken = searchParams.get("token") || "";

  const [stage, setStage] = useState<InterviewStage>("LOADING");
  const [meta, setMeta] = useState<InterviewMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [proctoringConfig, setProctoringConfig] = useState<ProctoringConfig>({ tier: "strict" });
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const session = useInterviewSession({ interviewId, accessToken });
  const proctoring = useProctoring(proctoringConfig);
  const voice = useVoiceInput();
  const screenCapture = useScreenCapture({ interviewId });
  const recording = useMediaRecording({
    interviewId,
    accessToken,
    stream: proctoring.webcamStream ?? null,
  });
  const [isPaused, setIsPaused] = useState(false);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);

  // Validate access on mount
  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/interviews/${interviewId}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Unable to access this interview");
          return;
        }

        const data = await res.json();
        setMeta(data);

        // Configure proctoring from template settings
        if (data.proctoringLevel || data.pastePolicy) {
          setProctoringConfig({
            tier: data.proctoringLevel || "strict",
            pastePolicy: data.pastePolicy || "block",
            maxPasteWarnings: data.maxPasteWarnings || 3,
          });
        }

        // Resume in-progress interview — show recovery dialog first
        if (data.status === "IN_PROGRESS" && data.hasTranscript) {
          if (data.transcript) {
            session.hydrateMessages(data.transcript);
          }
          setStage("RESUMING");
        } else if (data.status === "COMPLETED") {
          setStage("COMPLETE");
        } else if (data.readinessRequired && !data.readinessVerified) {
          // Template requires readiness checks — gate before welcome
          setStage("READINESS");
        } else {
          setStage("WELCOME");
        }
      } catch {
        setError("Failed to connect. Please check your internet connection.");
      }
    }

    if (interviewId && accessToken) {
      validate();
    } else {
      setError("Invalid interview link. Please check the URL.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, accessToken]);

  // Handle start — save consent, request fullscreen + start monitoring
  const handleStart = useCallback(async (consent: { consentRecording: boolean; consentProctoring: boolean; consentPrivacy: boolean }) => {
    // Persist consent to the backend — MUST succeed before starting
    try {
      const res = await fetch(`/api/interviews/${interviewId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          consentRecording: consent.consentRecording,
          consentProctoring: consent.consentProctoring,
          consentPrivacy: consent.consentPrivacy,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save consent. Please try again.");
        return;
      }
    } catch {
      setError("Network error saving consent. Please check your connection and try again.");
      return;
    }

    // Start screen capture if required by template
    if (meta?.screenShareRequired && !screenCapture.isActive) {
      await screenCapture.startCapture();
    }

    setStage("ACTIVE");

    // SECURITY: Always start proctoring monitoring regardless of voice provider
    proctoring.startMonitoring();

    if (meta?.voiceProvider !== "gemini-live") {
      await proctoring.requestFullscreen();
      await session.startInterview();
      // Start recording if webcam is active and consent given
      if (consent.consentRecording && proctoring.webcamStream) {
        recording.startRecording();
      }
    }
  }, [session, proctoring, screenCapture, recording, meta, interviewId, accessToken]);

  // Handle resume from interrupted session
  const handleResume = useCallback(() => {
    setStage("ACTIVE");
    proctoring.startMonitoring();
  }, [proctoring]);

  // Handle end with confirmation
  const handleEndRequest = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const handleEndConfirm = useCallback(async () => {
    setShowEndConfirm(false);
    setStage("CLOSING");
    await session.endInterview(proctoring.integrityEvents);
    // Finalize recording
    const elapsed = meta?.duration ? Math.round((Date.now() - (meta.duration ?? 0)) / 1000) : 0;
    await recording.finalizeRecording(elapsed);
    proctoring.stopWebcam();
    screenCapture.stopCapture();
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setStage("COMPLETE");
  }, [session, proctoring, screenCapture, recording, meta]);

  // Pause/Resume handlers for text interview mode
  const handlePause = useCallback(async () => {
    try {
      await fetch(`/api/interviews/${interviewId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", accessToken }),
      });
      setIsPaused(true);
    } catch {
      // Non-blocking
    }
  }, [interviewId, accessToken]);

  const handleResumePause = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews/${interviewId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume", accessToken }),
      });
      const data = await res.json();
      if (data.status === "CANCELLED") {
        setStage("COMPLETE");
        return;
      }
      setIsPaused(false);
    } catch {
      // Non-blocking
    }
  }, [interviewId, accessToken]);

  const handleEndCancel = useCallback(() => {
    setShowEndConfirm(false);
  }, []);

  // Auto-detect interview ended by session
  useEffect(() => {
    if (session.isEnded && stage === "ACTIVE") {
      proctoring.stopWebcam();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setStage("COMPLETE");
    }
  }, [session.isEnded, stage, proctoring]);

  // C1: Auto-end at max duration (45 min)
  useEffect(() => {
    if (stage !== "ACTIVE") return;

    autoEndTimerRef.current = setTimeout(async () => {
      setStage("CLOSING");
      await session.endInterview(proctoring.integrityEvents);
      proctoring.stopWebcam();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setStage("COMPLETE");
    }, MAX_DURATION_MS);

    return () => {
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // C5: Browser beforeunload guard
  useEffect(() => {
    if (stage !== "ACTIVE") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [stage]);

  // B5: Webcam PiP — bind stream to video element
  useEffect(() => {
    if (webcamVideoRef.current && proctoring.webcamStream) {
      webcamVideoRef.current.srcObject = proctoring.webcamStream;
    }
  }, [proctoring.webcamStream]);

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (stage === "LOADING") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <p className="text-zinc-400">Preparing your interview...</p>
        </div>
      </div>
    );
  }

  // Session recovery screen
  if (stage === "RESUMING" && meta) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="max-w-md w-full mx-4">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <span className="text-amber-500 text-2xl">!</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Resume Your Interview
            </h1>
            <p className="text-zinc-400 text-center text-sm">
              It looks like your interview was interrupted. Your previous responses
              have been saved and you can continue from where you left off.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 space-y-2 text-sm text-zinc-400">
            <p><span className="text-zinc-300 font-medium">Interview:</span> {meta.type.replace(/_/g, " ")}</p>
            <p><span className="text-zinc-300 font-medium">Status:</span> In Progress</p>
            <p><span className="text-zinc-300 font-medium">Your responses:</span> Saved</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleResume}
              className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold transition-colors"
            >
              Continue Interview
            </button>
          </div>

          <p className="text-zinc-600 text-xs text-center mt-4">
            Your previous conversation will be loaded automatically.
          </p>

          <a
            href={`/interview/reconnect/${interviewId}${accessToken ? `?token=${accessToken}` : ""}`}
            className="block text-center text-xs text-zinc-500 hover:text-zinc-400 underline mt-3"
          >
            Having trouble? Get reconnection help
          </a>
        </div>
      </div>
    );
  }

  // Readiness check gate — show InterviewPreCheck before welcome/voice
  if (stage === "READINESS" && meta) {
    return (
      <InterviewPreCheck
        interviewId={interviewId}
        accessToken={accessToken}
        onComplete={() => setStage("WELCOME")}
      />
    );
  }

  // Voice interview mode — route to VoiceInterviewRoom (only after consent via WelcomeScreen)
  if (meta?.voiceProvider === "gemini-live" && stage === "ACTIVE") {
    return (
      <VoiceInterviewRoom
        interviewId={interviewId}
        candidateName={meta.candidateName}
        jobTitle={meta.jobTitle || "Interview"}
        accessToken={accessToken}
        durationMinutes={meta.durationMinutes || 30}
      />
    );
  }

  // Welcome screen (text-based interview fallback)
  if (stage === "WELCOME" && meta) {
    return (
      <WelcomeScreen
        candidateName={meta.candidateName}
        interviewType={meta.type}
        webcamActive={proctoring.webcamActive}
        onRequestWebcam={proctoring.requestWebcam}
        onStart={handleStart}
        isStarting={session.isStreaming}
        screenShareRequired={meta.screenShareRequired}
        screenShareActive={screenCapture.isActive}
        onRequestScreenShare={screenCapture.startCapture}
        mode={meta.templateMode}
        templateConfig={meta.screenShareRequired || meta.candidateReportPolicy ? {
          screenShareRequired: meta.screenShareRequired,
          durationMinutes: meta.durationMinutes,
          candidateReportPolicy: meta.candidateReportPolicy || undefined,
        } : undefined}
        isPractice={meta.isPractice}
        voiceProvider={meta.voiceProvider}
      />
    );
  }

  // Complete screen
  if (stage === "COMPLETE" || stage === "CLOSING") {
    return (
      <InterviewComplete
        interviewId={interviewId}
        accessToken={accessToken}
      />
    );
  }

  // Active interview
  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <InterviewHeader
        interviewType={meta?.type || "TECHNICAL"}
        questionsAsked={session.questionsAsked}
        webcamActive={proctoring.webcamActive}
        tabSwitches={proctoring.tabSwitches}
        isActive={stage === "ACTIVE"}
        isFullscreen={proctoring.isFullscreen}
        pasteBlocked={proctoring.pasteBlocked}
        onEndInterview={handleEndRequest}
        onRequestFullscreen={proctoring.requestFullscreen}
        onPause={handlePause}
      />

      {/* Recording warning */}
      {recording.recordingWarning && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-400">
          Recording may be incomplete due to upload issues
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-sm text-center">
            <div className="text-4xl mb-4">⏸</div>
            <h2 className="text-xl font-bold text-white mb-2">Interview Paused</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Your progress is saved. The interview will auto-cancel if paused for more than 10 minutes.
            </p>
            <button
              onClick={handleResumePause}
              className="w-full px-4 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
            >
              Resume Interview
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Aria panel — left side */}
        <div className="w-1/2 border-r border-zinc-800 overflow-hidden">
          <AriaPanel
            messages={session.messages}
            streamingText={session.streamingText}
            isStreaming={session.isStreaming}
          />
        </div>

        {/* Candidate panel — right side */}
        <div className="w-1/2 overflow-hidden">
          <CandidatePanel
            messages={session.messages}
            isStreaming={session.isStreaming}
            onSendMessage={session.sendMessage}
            voiceSupported={voice.isSupported}
            isListening={voice.isListening}
            voiceTranscript={voice.transcript}
            onToggleVoice={voice.toggleListening}
            onResetVoice={voice.resetTranscript}
          />
        </div>
      </div>

      {/* B5: Webcam PiP preview */}
      {proctoring.webcamActive && proctoring.webcamStream && (
        <div className="fixed bottom-4 right-4 z-30">
          <video
            ref={webcamVideoRef}
            autoPlay
            muted
            playsInline
            className="w-40 h-30 rounded-xl border-2 border-zinc-700 object-cover shadow-lg"
          />
        </div>
      )}

      {/* Proctoring overlay */}
      <ProctoringOverlay
        tabSwitches={proctoring.tabSwitches}
        webcamActive={proctoring.webcamActive}
        isMonitoring={proctoring.isMonitoring}
        pasteBlocked={proctoring.pasteBlocked}
        pasteWarningCount={proctoring.pasteWarningCount}
        maxPasteWarnings={proctoringConfig.maxPasteWarnings}
        isFullscreen={proctoring.isFullscreen}
        tier={proctoring.tier}
      />

      {/* C2: Confirmation dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">
              End Interview?
            </h2>
            <p className="text-zinc-400 text-sm mb-6">
              Are you sure you want to end the interview? This cannot be undone.
              Your responses so far will be submitted for assessment.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleEndCancel}
                className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                Continue Interview
              </button>
              <button
                onClick={handleEndConfirm}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-medium"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session error display */}
      {session.error && (
        <div className="fixed bottom-4 left-4 z-50 bg-red-500/20 border border-red-500/40 backdrop-blur-sm text-red-400 px-4 py-2 rounded-lg text-sm">
          {session.error}
        </div>
      )}
    </div>
  );
}

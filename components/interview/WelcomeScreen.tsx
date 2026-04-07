"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Video,
  Monitor,
  MessageSquare,
  Clock,
  CheckCircle,
  Maximize2,
  ShieldCheck,
  Target,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import ArtifactNotice from "@/components/interview/ArtifactNotice";

interface WelcomeScreenProps {
  candidateName: string;
  interviewType: string;
  webcamActive: boolean;
  onRequestWebcam: () => void;
  onStart: (consent: { consentRecording: boolean; consentProctoring: boolean; consentPrivacy: boolean; accommodations?: { extendedTime: boolean; textOnly: boolean; captioning: boolean; screenReader: boolean } }) => void;
  isStarting: boolean;
  screenShareRequired?: boolean;
  screenShareActive?: boolean;
  onRequestScreenShare?: () => void;
  voiceProvider?: string | null;
  mode?: string | null;
  templateConfig?: {
    screenShareRequired?: boolean;
    readinessCheckRequired?: boolean;
    durationMinutes?: number;
    retakePolicy?: Record<string, unknown>;
    candidateReportPolicy?: Record<string, boolean>;
  };
  isPractice?: boolean;
}

export function WelcomeScreen({
  candidateName,
  interviewType,
  webcamActive,
  onRequestWebcam,
  onStart,
  isStarting,
  screenShareRequired = false,
  screenShareActive = false,
  onRequestScreenShare,
  voiceProvider,
  mode,
  templateConfig,
  isPractice = false,
}: WelcomeScreenProps) {
  const [consentRecording, setConsentRecording] = useState<boolean>(false);
  const [consentProctoring, setConsentProctoring] = useState<boolean>(false);
  const [consentPrivacy, setConsentPrivacy] = useState<boolean>(false);
  const [artifactAcknowledged, setArtifactAcknowledged] = useState<boolean>(!templateConfig);
  const [showAccommodations, setShowAccommodations] = useState(false);
  const [accommodations, setAccommodations] = useState({
    extendedTime: false,
    textOnly: false,
    captioning: false,
    screenReader: false,
  });

  const allConsented = consentRecording && consentProctoring && consentPrivacy && artifactAcknowledged;
  const screenShareReady = !screenShareRequired || screenShareActive;
  const typeLabel = interviewType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 py-8">
      <div className="max-w-lg w-full mx-4">
        {/* Aria Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4">
            <span className="text-white font-bold text-3xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome, {candidateName}
          </h1>
          <p className="text-zinc-400 text-center">
            I&apos;m Aria, your AI interviewer. I&apos;ll be conducting your{" "}
            <span className="text-violet-400 font-medium">{typeLabel}</span>{" "}
            interview today.
          </p>
        </div>

        {/* Interview info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6 space-y-4">
          <div className="flex items-center gap-3 text-zinc-300">
            <Clock className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>Estimated duration: ~30 minutes (45 min max)</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-300">
            <MessageSquare className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>{voiceProvider === "gemini-live" ? "Real-time voice conversation with Aria" : "Text-based conversation (voice input optional)"}</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-300">
            <CheckCircle className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>7-8 adaptive questions tailored to your experience</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-300">
            <Maximize2 className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>Fullscreen mode is recommended during the interview</span>
          </div>
        </div>

        {/* Interview Tips */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h3 className="text-zinc-200 font-medium mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-400" />
            Tips for Success
          </h3>
          <ol className="space-y-2.5 text-sm text-zinc-400">
            <li className="flex items-start gap-2">
              <span className="text-violet-400 font-semibold shrink-0">1.</span>
              <span>
                Use the <strong className="text-zinc-300">STAR method</strong>:
                Situation, Task, Action, Result for behavioral questions.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-400 font-semibold shrink-0">2.</span>
              <span>
                Be specific with <strong className="text-zinc-300">metrics and outcomes</strong> —
                &quot;increased throughput by 40%&quot; beats &quot;made things faster.&quot;
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-400 font-semibold shrink-0">3.</span>
              <span>
                Take your time to think before responding. Quality matters more
                than speed.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-400 font-semibold shrink-0">4.</span>
              <span>
                Reference your <strong className="text-zinc-300">specific projects and technologies</strong> from
                your resume.
              </span>
            </li>
          </ol>
        </div>

        {/* Webcam */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Video className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-zinc-300 font-medium">Webcam Monitoring</p>
                <p className="text-zinc-500 text-sm">
                  Optional — helps verify interview integrity
                </p>
              </div>
            </div>
            {webcamActive ? (
              <div className="flex items-center gap-2 text-green-500">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Active</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onRequestWebcam}
                className="border-zinc-600 text-zinc-900 bg-zinc-200 hover:bg-zinc-300"
              >
                Enable
              </Button>
            )}
          </div>
        </div>

        {/* Screen Share (if required by template) */}
        {screenShareRequired && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-zinc-500" />
                <div>
                  <p className="text-zinc-300 font-medium">Screen Sharing</p>
                  <p className="text-zinc-500 text-sm">
                    Required — your screen will be monitored during the interview
                  </p>
                </div>
              </div>
              {screenShareActive ? (
                <div className="flex items-center gap-2 text-green-500">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Active</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRequestScreenShare}
                  className="border-zinc-600 text-zinc-900 bg-zinc-200 hover:bg-zinc-300"
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Artifact Notice (mode-specific recording details) */}
        {templateConfig && (
          <div className="mb-6">
            <ArtifactNotice
              mode={mode || interviewType}
              templateConfig={{
                screenShareRequired: templateConfig.screenShareRequired,
                readinessCheckRequired: templateConfig.readinessCheckRequired,
                durationMinutes: templateConfig.durationMinutes,
                retakePolicy: templateConfig.retakePolicy as any,
                candidateReportPolicy: templateConfig.candidateReportPolicy as any,
              }}
              isPractice={isPractice}
              onAcknowledge={() => setArtifactAcknowledged(true)}
            />
          </div>
        )}

        {/* Integrity monitoring notice */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-amber-200 text-sm font-medium">
                Integrity Monitoring
              </p>
              <p className="text-zinc-500 text-xs mb-2">
                The following activities are monitored and included in your integrity score:
              </p>
              <ul className="text-zinc-500 text-xs space-y-1">
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Tab switches and window focus changes are logged
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Paste events are detected and recorded
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Webcam access status is tracked (if enabled)
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Fullscreen exit events are logged
                </li>
              </ul>
              <p className="text-zinc-600 text-xs mt-2">
                These events are logged as telemetry and factor into your integrity score. They do not block interview progress.
              </p>
            </div>
          </div>
        </div>

        {/* Accommodations */}
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            onClick={() => setShowAccommodations(!showAccommodations)}
            aria-expanded={showAccommodations}
            aria-controls="accommodations-panel"
          >
            <svg className={`w-4 h-4 transition-transform ${showAccommodations ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            Request Accommodations
          </button>
          {showAccommodations && (
            <div id="accommodations-panel" className="space-y-3 pl-6" role="group" aria-label="Accommodation options">
              <p className="text-xs text-zinc-500">We are committed to providing equal access. Select any accommodations you need:</p>
              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={accommodations.extendedTime} onChange={(e) => setAccommodations(prev => ({ ...prev, extendedTime: e.target.checked }))} className="rounded border-zinc-600" />
                <span>Extended time (50% more time)</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={accommodations.textOnly} onChange={(e) => setAccommodations(prev => ({ ...prev, textOnly: e.target.checked }))} className="rounded border-zinc-600" />
                <span>Text-only mode (no voice)</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={accommodations.captioning} onChange={(e) => setAccommodations(prev => ({ ...prev, captioning: e.target.checked }))} className="rounded border-zinc-600" />
                <span>Live captions</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={accommodations.screenReader} onChange={(e) => setAccommodations(prev => ({ ...prev, screenReader: e.target.checked }))} className="rounded border-zinc-600" />
                <span>Screen reader optimized</span>
              </label>
            </div>
          )}
        </div>

        {/* Recording Consent */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6 space-y-4" role="group" aria-labelledby="consent-heading">
          <h3 id="consent-heading" className="text-zinc-200 font-medium mb-1 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            Consent &amp; Acknowledgements
          </h3>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={consentRecording}
              onChange={(e) => setConsentRecording(e.target.checked)}
              aria-label="Consent to video and audio recording"
              aria-describedby="consent-recording-desc"
              className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 accent-violet-600"
            />
            <span id="consent-recording-desc" className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
              I consent to being recorded (video and audio) during this interview
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={consentProctoring}
              onChange={(e) => setConsentProctoring(e.target.checked)}
              aria-label="Consent to integrity monitoring"
              aria-describedby="consent-proctoring-desc"
              className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 accent-violet-600"
            />
            <span id="consent-proctoring-desc" className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
              I consent to integrity monitoring (tab switches, paste detection, webcam, and fullscreen tracking) for assessment purposes
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={consentPrivacy}
              onChange={(e) => setConsentPrivacy(e.target.checked)}
              aria-label="Agree to Privacy Policy"
              aria-describedby="consent-privacy-desc"
              className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 accent-violet-600"
            />
            <span id="consent-privacy-desc" className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
              I have read and agree to the Privacy Policy
            </span>
          </label>
        </div>

        {/* Data Retention Notice */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <BarChart3 className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-500 space-y-1">
              <p className="text-zinc-400 font-medium">Data Retention</p>
              <p>Your interview recording, transcript, and evaluation data will be retained according to company policy (default: 90 days for recordings, 365 days for transcripts). You may request data deletion at any time by contacting support.</p>
            </div>
          </div>
        </div>

        {/* Start button */}
        <Button
          onClick={() => onStart({ consentRecording, consentProctoring, consentPrivacy, accommodations: showAccommodations ? accommodations : undefined })}
          disabled={isStarting || !allConsented || !screenShareReady}
          className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            "Start Interview"
          )}
        </Button>
      </div>
    </div>
  );
}

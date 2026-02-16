"use client";

import { Button } from "@/components/ui/button";
import {
  Video,
  MessageSquare,
  Clock,
  CheckCircle,
  Maximize2,
  ShieldCheck,
  Target,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

interface WelcomeScreenProps {
  candidateName: string;
  interviewType: string;
  webcamActive: boolean;
  onRequestWebcam: () => void;
  onStart: () => void;
  isStarting: boolean;
}

export function WelcomeScreen({
  candidateName,
  interviewType,
  webcamActive,
  onRequestWebcam,
  onStart,
  isStarting,
}: WelcomeScreenProps) {
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
            <span>Text-based conversation (voice input optional)</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-300">
            <CheckCircle className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>7-8 adaptive questions tailored to your experience</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-300">
            <Maximize2 className="w-5 h-5 text-zinc-500 shrink-0" />
            <span>Fullscreen mode will be enabled during the interview</span>
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
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Enable
              </Button>
            )}
          </div>
        </div>

        {/* Proctoring notice */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-amber-200 text-sm font-medium">
                Proctored Interview Session
              </p>
              <ul className="text-zinc-500 text-xs space-y-1">
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Tab switching and window focus are monitored
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Copy-paste is disabled during the interview
                </li>
                <li className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> All activity is logged in your integrity report
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Start button */}
        <Button
          onClick={onStart}
          disabled={isStarting}
          className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold text-base"
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

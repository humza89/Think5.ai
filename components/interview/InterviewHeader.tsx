"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Video,
  VideoOff,
  AlertTriangle,
  Maximize2,
  ClipboardX,
} from "lucide-react";
import { useState, useEffect } from "react";

interface InterviewHeaderProps {
  interviewType: string;
  questionsAsked: number;
  maxQuestions?: number;
  webcamActive: boolean;
  tabSwitches: number;
  isActive: boolean;
  isFullscreen: boolean;
  pasteBlocked: boolean;
  onEndInterview: () => void;
  onRequestFullscreen: () => void;
}

const MAX_DURATION_SECONDS = 45 * 60; // 45 minutes

export function InterviewHeader({
  interviewType,
  questionsAsked,
  maxQuestions = 8,
  webcamActive,
  tabSwitches,
  isActive,
  isFullscreen,
  pasteBlocked,
  onEndInterview,
  onRequestFullscreen,
}: InterviewHeaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const remaining = MAX_DURATION_SECONDS - elapsed;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Timer color: amber at 5min remaining, red at 2min
  const timerColor =
    remaining <= 120
      ? "text-red-400"
      : remaining <= 300
        ? "text-amber-400"
        : "text-zinc-400";

  const progress = Math.min((questionsAsked / maxQuestions) * 100, 100);

  const typeLabel = interviewType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-white font-semibold text-lg">Aria</span>
        </div>
        <Badge
          variant="secondary"
          className="bg-zinc-800 text-zinc-300 border-zinc-700"
        >
          {typeLabel}
        </Badge>
      </div>

      <div className="flex items-center gap-6">
        {/* Timer */}
        <div className={`flex items-center gap-2 ${timerColor}`}>
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm">{timeStr}</span>
        </div>

        {/* Question progress bar */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-zinc-400 text-sm">
            Q{questionsAsked}/{maxQuestions}
          </span>
        </div>

        {/* Proctoring indicators */}
        <div className="flex items-center gap-3">
          {webcamActive ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <Video className="w-4 h-4 text-green-500" />
            </div>
          ) : (
            <VideoOff className="w-4 h-4 text-zinc-500" />
          )}

          {/* Fullscreen indicator */}
          {!isFullscreen && (
            <button
              onClick={onRequestFullscreen}
              className="flex items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors"
              title="Enter fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* Paste-block badge */}
          {pasteBlocked && (
            <div className="flex items-center gap-1 text-red-400">
              <ClipboardX className="w-4 h-4" />
            </div>
          )}

          {tabSwitches > 0 && (
            <div className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">{tabSwitches}</span>
            </div>
          )}
        </div>

        {/* End interview */}
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onEndInterview}
            className="bg-red-600 hover:bg-red-700"
          >
            End Interview
          </Button>
        )}
      </div>
    </header>
  );
}

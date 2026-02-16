"use client";

import {
  AlertTriangle,
  VideoOff,
  ClipboardX,
  Maximize2,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

interface ProctoringOverlayProps {
  tabSwitches: number;
  webcamActive: boolean;
  isMonitoring: boolean;
  pasteBlocked: boolean;
  isFullscreen: boolean;
}

export function ProctoringOverlay({
  tabSwitches,
  webcamActive,
  isMonitoring,
  pasteBlocked,
  isFullscreen,
}: ProctoringOverlayProps) {
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);
  const [prevTabSwitches, setPrevTabSwitches] = useState(0);

  // Show warning banner when tab switches increase
  useEffect(() => {
    if (tabSwitches > prevTabSwitches && isMonitoring) {
      setShowTabWarning(true);
      setPrevTabSwitches(tabSwitches);
      const timer = setTimeout(() => setShowTabWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [tabSwitches, prevTabSwitches, isMonitoring]);

  // Show fullscreen exit warning
  useEffect(() => {
    if (!isFullscreen && isMonitoring) {
      setShowFullscreenWarning(true);
      const timer = setTimeout(() => setShowFullscreenWarning(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowFullscreenWarning(false);
    }
  }, [isFullscreen, isMonitoring]);

  if (!isMonitoring) return null;

  return (
    <>
      {/* Tab switch warning */}
      {showTabWarning && (
        <div className="fixed top-16 left-0 right-0 z-50 flex justify-center animate-in slide-in-from-top duration-300">
          <div className="bg-amber-500/90 backdrop-blur-sm text-black px-6 py-3 rounded-b-xl flex items-center gap-3 shadow-lg">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium text-sm">
              Tab switch detected — this is noted in your assessment
            </span>
          </div>
        </div>
      )}

      {/* Paste blocked warning */}
      {pasteBlocked && (
        <div className="fixed top-16 left-0 right-0 z-50 flex justify-center animate-in slide-in-from-top duration-300">
          <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-b-xl flex items-center gap-3 shadow-lg">
            <ClipboardX className="w-5 h-5" />
            <span className="font-medium text-sm">
              Paste is not allowed during the interview
            </span>
          </div>
        </div>
      )}

      {/* Fullscreen exit warning */}
      {showFullscreenWarning && (
        <div className="fixed top-16 left-0 right-0 z-50 flex justify-center animate-in slide-in-from-top duration-300">
          <div className="bg-orange-500/90 backdrop-blur-sm text-black px-6 py-3 rounded-b-xl flex items-center gap-3 shadow-lg">
            <Maximize2 className="w-5 h-5" />
            <span className="font-medium text-sm">
              Fullscreen exit detected — please return to fullscreen mode
            </span>
          </div>
        </div>
      )}

      {/* Webcam lost warning */}
      {!webcamActive && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-red-500/20 border border-red-500/40 backdrop-blur-sm text-red-400 px-4 py-2 rounded-lg flex items-center gap-2">
            <VideoOff className="w-4 h-4" />
            <span className="text-sm font-medium">Webcam inactive</span>
          </div>
        </div>
      )}

      {/* Persistent proctoring status indicator */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 px-3 py-1.5 rounded-full">
          <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-500">Proctored Session</span>
        </div>
      </div>
    </>
  );
}

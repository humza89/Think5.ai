"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ProctoringTier = "none" | "light" | "strict";
export type PastePolicy = "allow" | "warn" | "block";
export type CopyPolicy = "allow" | "warn" | "block";

export interface ProctoringConfig {
  tier: ProctoringTier;
  pastePolicy?: PastePolicy;
  copyPolicy?: CopyPolicy;
  maxPasteWarnings?: number;
}

interface IntegrityEvent {
  type:
    | "tab_switch"
    | "focus_lost"
    | "webcam_lost"
    | "webcam_denied"
    | "paste_detected"
    | "copy_detected"
    | "right_click"
    | "devtools_attempt"
    | "fullscreen_exit"
    | "keyboard_shortcut";
  description: string;
  timestamp: string;
}

interface UseProctoringReturn {
  integrityEvents: IntegrityEvent[];
  webcamActive: boolean;
  webcamStream: MediaStream | null;
  tabSwitches: number;
  focusLostCount: number;
  pasteBlocked: boolean;
  pasteWarningCount: number;
  isFullscreen: boolean;
  requestWebcam: () => Promise<boolean>;
  stopWebcam: () => void;
  isMonitoring: boolean;
  startMonitoring: () => void;
  requestFullscreen: () => Promise<void>;
  tier: ProctoringTier;
}

const DEFAULT_CONFIG: ProctoringConfig = {
  tier: "strict",
  pastePolicy: "block",
  copyPolicy: "warn",
  maxPasteWarnings: 3,
};

export function useProctoring(
  config: ProctoringConfig = DEFAULT_CONFIG
): UseProctoringReturn {
  const { tier, pastePolicy = "block", copyPolicy = "warn", maxPasteWarnings = 3 } = config;

  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [focusLostCount, setFocusLostCount] = useState(0);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const [pasteWarningCount, setPasteWarningCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const pasteWarningCountRef = useRef(0);

  const addEvent = useCallback(
    (type: IntegrityEvent["type"], description: string) => {
      const event: IntegrityEvent = {
        type,
        description,
        timestamp: new Date().toISOString(),
      };
      setIntegrityEvents((prev) => [...prev, event]);
    },
    []
  );

  // Determine effective paste policy (escalate after max warnings)
  const getEffectivePastePolicy = useCallback((): PastePolicy => {
    if (pastePolicy === "warn" && pasteWarningCountRef.current >= maxPasteWarnings) {
      return "block";
    }
    return pastePolicy;
  }, [pastePolicy, maxPasteWarnings]);

  // Tab switch detection — available in light + strict tiers
  useEffect(() => {
    if (!isMonitoring || tier === "none") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches((prev) => prev + 1);
        addEvent("tab_switch", "Candidate switched to another tab");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMonitoring, tier, addEvent]);

  // Window blur — available in light + strict tiers
  useEffect(() => {
    if (!isMonitoring || tier === "none") return;

    const handleBlur = () => {
      setFocusLostCount((prev) => prev + 1);
      addEvent("focus_lost", "Interview window lost focus");
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, [isMonitoring, tier, addEvent]);

  // Copy-paste detection — strict tier only (configurable policy)
  useEffect(() => {
    if (!isMonitoring || tier !== "strict") return;

    const handlePaste = (e: ClipboardEvent) => {
      // Use ref-based check to prevent race condition with rapid pastes
      const shouldBlock = pastePolicy === "block" ||
        (pastePolicy === "warn" && pasteWarningCountRef.current >= maxPasteWarnings);

      if (pastePolicy === "allow") return;

      if (shouldBlock) {
        e.preventDefault();
        setPasteBlocked(true);
        addEvent("paste_detected", "Paste attempt blocked during interview");
        setTimeout(() => setPasteBlocked(false), 3000);
      } else if (pastePolicy === "warn") {
        // Allow the paste but log and warn — increment ref synchronously
        pasteWarningCountRef.current += 1;
        const currentCount = pasteWarningCountRef.current;
        setPasteWarningCount(currentCount);
        setPasteBlocked(true);
        addEvent(
          "paste_detected",
          `Paste detected (warning ${currentCount}/${maxPasteWarnings})`
        );
        setTimeout(() => setPasteBlocked(false), 3000);
      }
    };

    const handleCopy = () => {
      if (copyPolicy === "allow") return;
      if (copyPolicy === "block") {
        // Log but don't prevent — blocking copy is too aggressive
        addEvent("copy_detected", "Candidate copied text during interview");
      } else {
        addEvent("copy_detected", "Candidate copied text during interview");
      }
    };

    document.addEventListener("paste", handlePaste);
    document.addEventListener("copy", handleCopy);
    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("copy", handleCopy);
    };
  }, [isMonitoring, tier, getEffectivePastePolicy, copyPolicy, maxPasteWarnings, addEvent]);

  // Right-click blocking — strict tier only
  useEffect(() => {
    if (!isMonitoring || tier !== "strict") return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      addEvent("right_click", "Right-click attempt blocked during interview");
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isMonitoring, tier, addEvent]);

  // Keyboard shortcut monitoring — strict tier only
  useEffect(() => {
    if (!isMonitoring || tier !== "strict") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Detect devtools attempt (Ctrl+Shift+I, Ctrl+Shift+J, F12)
      if (
        (ctrl && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")) ||
        e.key === "F12"
      ) {
        e.preventDefault();
        addEvent("devtools_attempt", `DevTools shortcut detected: ${e.key}`);
        return;
      }

      // Detect Ctrl+V (paste via keyboard) — use ref for race-safe escalation
      if (ctrl && (e.key === "v" || e.key === "V")) {
        const shouldBlock = pastePolicy === "block" ||
          (pastePolicy === "warn" && pasteWarningCountRef.current >= maxPasteWarnings);
        if (shouldBlock) {
          e.preventDefault();
          setPasteBlocked(true);
          addEvent("keyboard_shortcut", "Ctrl+V paste shortcut blocked");
          setTimeout(() => setPasteBlocked(false), 3000);
        } else if (pastePolicy === "warn") {
          pasteWarningCountRef.current += 1;
          const currentCount = pasteWarningCountRef.current;
          setPasteWarningCount(currentCount);
          setPasteBlocked(true);
          addEvent(
            "keyboard_shortcut",
            `Ctrl+V paste detected (warning ${currentCount}/${maxPasteWarnings})`
          );
          setTimeout(() => setPasteBlocked(false), 3000);
        }
        return;
      }

      // Log Ctrl+A (select all) — don't block
      if (ctrl && (e.key === "a" || e.key === "A")) {
        addEvent("keyboard_shortcut", "Select all shortcut used (Ctrl+A)");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMonitoring, tier, getEffectivePastePolicy, maxPasteWarnings, addEvent]);

  // Fullscreen tracking — strict tier only
  useEffect(() => {
    if (!isMonitoring || tier !== "strict") return;

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen) {
        addEvent("fullscreen_exit", "Candidate exited fullscreen mode");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isMonitoring, tier, addEvent]);

  const requestFullscreen = useCallback(async () => {
    if (tier !== "strict") return;
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Fullscreen not supported or denied — non-blocking
    }
  }, [tier]);

  const requestWebcam = useCallback(async (): Promise<boolean> => {
    if (tier === "none") return true; // No webcam needed
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setWebcamStream(stream);
      setWebcamActive(true);

      // Monitor for webcam track ending
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setWebcamActive(false);
          addEvent("webcam_lost", "Webcam disconnected during interview");
        };
      }

      return true;
    } catch {
      addEvent("webcam_denied", "Candidate denied webcam access");
      return false;
    }
  }, [tier, addEvent]);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setWebcamStream(null);
      setWebcamActive(false);
    }
  }, []);

  const startMonitoring = useCallback(() => {
    if (tier === "none") return;
    setIsMonitoring(true);
  }, [tier]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    integrityEvents,
    webcamActive,
    webcamStream,
    tabSwitches,
    focusLostCount,
    pasteBlocked,
    pasteWarningCount,
    isFullscreen,
    requestWebcam,
    stopWebcam,
    isMonitoring,
    startMonitoring,
    requestFullscreen,
    tier,
  };
}

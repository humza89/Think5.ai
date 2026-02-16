"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  isFullscreen: boolean;
  requestWebcam: () => Promise<boolean>;
  stopWebcam: () => void;
  isMonitoring: boolean;
  startMonitoring: () => void;
  requestFullscreen: () => Promise<void>;
}

export function useProctoring(): UseProctoringReturn {
  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [focusLostCount, setFocusLostCount] = useState(0);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

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

  // B1: Page Visibility API — tab switch detection
  useEffect(() => {
    if (!isMonitoring) return;

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
  }, [isMonitoring, addEvent]);

  // Window blur — focus lost tracking
  useEffect(() => {
    if (!isMonitoring) return;

    const handleBlur = () => {
      setFocusLostCount((prev) => prev + 1);
      addEvent("focus_lost", "Interview window lost focus");
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, [isMonitoring, addEvent]);

  // B1: Copy-paste detection — block paste, log both
  useEffect(() => {
    if (!isMonitoring) return;

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      setPasteBlocked(true);
      addEvent("paste_detected", "Paste attempt blocked during interview");
      setTimeout(() => setPasteBlocked(false), 3000);
    };

    const handleCopy = () => {
      addEvent("copy_detected", "Candidate copied text during interview");
    };

    document.addEventListener("paste", handlePaste);
    document.addEventListener("copy", handleCopy);
    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("copy", handleCopy);
    };
  }, [isMonitoring, addEvent]);

  // B2: Right-click blocking
  useEffect(() => {
    if (!isMonitoring) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      addEvent("right_click", "Right-click attempt blocked during interview");
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isMonitoring, addEvent]);

  // B3: Keyboard shortcut monitoring
  useEffect(() => {
    if (!isMonitoring) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Detect devtools attempt (Ctrl+Shift+I, Ctrl+Shift+J, F12)
      if (
        (ctrl && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")) ||
        e.key === "F12"
      ) {
        e.preventDefault();
        addEvent(
          "devtools_attempt",
          `DevTools shortcut detected: ${e.key}`
        );
        return;
      }

      // Detect Ctrl+V (paste via keyboard)
      if (ctrl && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        setPasteBlocked(true);
        addEvent("keyboard_shortcut", "Ctrl+V paste shortcut blocked");
        setTimeout(() => setPasteBlocked(false), 3000);
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
  }, [isMonitoring, addEvent]);

  // B4: Fullscreen tracking
  useEffect(() => {
    if (!isMonitoring) return;

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
  }, [isMonitoring, addEvent]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Fullscreen not supported or denied — non-blocking
    }
  }, []);

  const requestWebcam = useCallback(async (): Promise<boolean> => {
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
  }, [addEvent]);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setWebcamStream(null);
      setWebcamActive(false);
    }
  }, []);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

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
    isFullscreen,
    requestWebcam,
    stopWebcam,
    isMonitoring,
    startMonitoring,
    requestFullscreen,
  };
}

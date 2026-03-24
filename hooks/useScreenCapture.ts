/**
 * Screen Capture Hook
 *
 * Uses the getDisplayMedia() API for screen sharing during interviews.
 * Captures periodic screenshots and uploads them via the screen-capture API.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScreenCaptureState {
  isActive: boolean;
  isSupported: boolean;
  sessionId: string | null;
  error: string | null;
}

interface UseScreenCaptureOptions {
  interviewId: string;
  screenshotIntervalMs?: number; // Default: 30s
  onEnded?: () => void;
}

export function useScreenCapture({
  interviewId,
  screenshotIntervalMs = 30000,
  onEnded,
}: UseScreenCaptureOptions) {
  const [state, setState] = useState<ScreenCaptureState>({
    isActive: false,
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
    sessionId: null,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const captureScreenshot = useCallback(async () => {
    if (!streamRef.current || !state.sessionId) return;

    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (!track) return;

      // Use ImageCapture API if available, otherwise use canvas
      const canvas = document.createElement("canvas");
      const video = videoRef.current;
      if (!video) return;

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.5);

      // Upload thumbnail
      await fetch(`/api/interviews/${interviewId}/screen-capture`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          thumbnailUrl,
        }),
      });
    } catch {
      // Non-critical — continue capturing
    }
  }, [interviewId, state.sessionId]);

  const startCapture = useCallback(async () => {
    if (!state.isSupported) {
      setState((s) => ({ ...s, error: "Screen sharing is not supported in this browser" }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });

      streamRef.current = stream;

      // Create hidden video element for screenshot capture
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      videoRef.current = video;

      // Register session with backend
      const res = await fetch(`/api/interviews/${interviewId}/screen-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureType: "screen_share", consentGiven: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session");

      setState((s) => ({
        ...s,
        isActive: true,
        sessionId: data.session.id,
        error: null,
      }));

      // Start periodic screenshot capture
      intervalRef.current = setInterval(captureScreenshot, screenshotIntervalMs);

      // Handle stream ending (user clicks "Stop sharing")
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopCapture();
        onEnded?.();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start screen capture";
      setState((s) => ({ ...s, error: message }));
    }
  }, [interviewId, screenshotIntervalMs, state.isSupported, captureScreenshot, onEnded]);

  const stopCapture = useCallback(async () => {
    // Stop the interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clean up video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    // End session on backend
    if (state.sessionId) {
      try {
        await fetch(
          `/api/interviews/${interviewId}/screen-capture?sessionId=${state.sessionId}`,
          { method: "DELETE" }
        );
      } catch {
        // Best effort
      }
    }

    setState((s) => ({ ...s, isActive: false, sessionId: null }));
  }, [interviewId, state.sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startCapture,
    stopCapture,
  };
}

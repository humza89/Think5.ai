"use client";

/**
 * useMediaRecording — Reusable recording hook
 *
 * Extracted from VoiceInterviewRoom. Handles MediaRecorder setup,
 * chunked upload to the recording API, and finalization.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaRecordingOptions {
  interviewId: string;
  accessToken: string;
  stream: MediaStream | null;
  chunkIntervalMs?: number;
}

interface UseMediaRecordingReturn {
  isRecording: boolean;
  recordingWarning: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  finalizeRecording: (durationSeconds: number) => Promise<void>;
}

export function useMediaRecording({
  interviewId,
  accessToken,
  stream,
  chunkIntervalMs = 2000,
}: UseMediaRecordingOptions): UseMediaRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingWarning, setRecordingWarning] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkCountRef = useRef(0);
  const failedChunksRef = useRef(0);

  const uploadChunk = useCallback(
    async (blob: Blob, index: number) => {
      try {
        const formData = new FormData();
        formData.append("chunk", blob);
        formData.append("chunkIndex", String(index));
        formData.append("accessToken", accessToken);

        await fetch(`/api/interviews/${interviewId}/recording`, {
          method: "POST",
          body: formData,
        });
        failedChunksRef.current = 0;
      } catch {
        failedChunksRef.current++;
        if (failedChunksRef.current >= 3) {
          setRecordingWarning(true);
        }
      }
    },
    [interviewId, accessToken]
  );

  const startRecording = useCallback(() => {
    if (!stream) return;

    try {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp9",
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await uploadChunk(event.data, chunkCountRef.current);
          chunkCountRef.current++;
        }
      };

      recorder.start(chunkIntervalMs);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      console.error("[MediaRecording] Failed to start recording");
    }
  }, [stream, chunkIntervalMs, uploadChunk]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const finalizeRecording = useCallback(
    async (durationSeconds: number) => {
      stopRecording();

      try {
        await fetch(`/api/interviews/${interviewId}/recording`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finalize",
            totalChunks: chunkCountRef.current,
            format: "webm",
            durationSeconds,
          }),
        });
      } catch {
        // Silent fail — finalization is best-effort
      }
    },
    [interviewId, stopRecording]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    recordingWarning,
    startRecording,
    stopRecording,
    finalizeRecording,
  };
}

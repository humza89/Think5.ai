"use client";

/**
 * useMediaRecording — Reusable recording hook
 *
 * Extracted from VoiceInterviewRoom. Handles MediaRecorder setup,
 * chunked upload to the recording API, and finalization.
 * Includes retry with exponential backoff and IndexedDB offline queue.
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
      // Compute SHA256 checksum
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const maxAttempts = 3;
      const baseBackoffMs = [1000, 2000, 4000];

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const formData = new FormData();
          formData.append("chunk", blob);
          formData.append("chunkIndex", String(index));
          formData.append("checksum", checksum);

          const res = await fetch(`/api/interviews/${interviewId}/recording`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData,
          });

          if (res.status === 429) {
            // Rate limited — wait longer
            const retryAfter = 5000;
            await new Promise((r) => setTimeout(r, retryAfter));
            continue;
          }

          if (!res.ok) {
            throw new Error(`Upload failed: ${res.status}`);
          }

          failedChunksRef.current = 0;
          return; // Success
        } catch {
          if (attempt < maxAttempts - 1) {
            // Exponential backoff with ±30% jitter
            const base = baseBackoffMs[attempt];
            const jitter = base * 0.3 * (Math.random() * 2 - 1);
            await new Promise((r) => setTimeout(r, base + jitter));
          }
        }
      }

      // All retries failed — queue for later
      failedChunksRef.current++;
      if (failedChunksRef.current >= 3) {
        setRecordingWarning(true);
      }

      // Enqueue to IndexedDB for offline retry
      try {
        const { enqueueChunk: enqueue } = await import("@/lib/chunk-queue");
        await enqueue(interviewId, index, blob, checksum);
      } catch {
        // IndexedDB not available — silent fail
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
          videoBitsPerSecond: 1_500_000, // 1.5 Mbps — ~50% smaller files at 720p
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

      // Drain any remaining queued chunks
      try {
        const { getQueuedChunks, removeChunk } = await import("@/lib/chunk-queue");
        const queued = await getQueuedChunks(interviewId);
        for (const chunk of queued) {
          try {
            const formData = new FormData();
            formData.append("chunk", chunk.blob);
            formData.append("chunkIndex", String(chunk.chunkIndex));
            formData.append("checksum", chunk.checksum);
            const res = await fetch(`/api/interviews/${interviewId}/recording`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}` },
              body: formData,
            });
            if (res.ok) await removeChunk(chunk.id);
          } catch {
            // Best effort
          }
        }
      } catch {
        // IndexedDB not available
      }

      // Check for gaps before finalizing
      try {
        const gapRes = await fetch(`/api/interviews/${interviewId}/recording`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: "check_gaps",
            totalChunks: chunkCountRef.current,
          }),
        });
        const gapData = await gapRes.json();
        if (gapData.missingChunks?.length > 0) {
          console.warn("[Recording] Missing chunks detected:", gapData.missingChunks);
        }
      } catch {
        // Non-critical
      }

      // Finalize
      try {
        await fetch(`/api/interviews/${interviewId}/recording`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
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

      // Clear the IndexedDB queue
      try {
        const { clearQueue } = await import("@/lib/chunk-queue");
        await clearQueue(interviewId);
      } catch {
        // IndexedDB not available
      }
    },
    [interviewId, accessToken, stopRecording]
  );

  // Drain offline queue periodically
  useEffect(() => {
    if (!isRecording) return;

    const drainInterval = setInterval(async () => {
      try {
        const { getQueuedChunks, removeChunk } = await import("@/lib/chunk-queue");
        const queued = await getQueuedChunks(interviewId);
        for (const chunk of queued) {
          try {
            const formData = new FormData();
            formData.append("chunk", chunk.blob);
            formData.append("chunkIndex", String(chunk.chunkIndex));
            formData.append("checksum", chunk.checksum);

            const res = await fetch(`/api/interviews/${interviewId}/recording`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}` },
              body: formData,
            });
            if (res.ok) {
              await removeChunk(chunk.id);
            }
          } catch {
            // Will retry next interval
          }
        }
      } catch {
        // IndexedDB not available
      }
    }, 5000);

    return () => clearInterval(drainInterval);
  }, [isRecording, interviewId, accessToken]);

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

"use client";

import { useState, useCallback, useRef } from "react";

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
}

interface UseInterviewSessionOptions {
  interviewId: string;
  accessToken: string;
}

interface UseInterviewSessionReturn {
  messages: Message[];
  isStreaming: boolean;
  streamingText: string;
  questionsAsked: number;
  error: string | null;
  isEnded: boolean;
  startInterview: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  endInterview: (integrityEvents?: any[]) => Promise<void>;
  hydrateMessages: (
    transcript: Array<{ role: string; content: string; timestamp?: string }>
  ) => void;
}

export function useInterviewSession({
  interviewId,
  accessToken,
}: UseInterviewSessionOptions): UseInterviewSessionReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const streamRequest = useCallback(
    async (body: Record<string, any>) => {
      setError(null);
      setIsStreaming(true);
      setStreamingText("");

      abortRef.current = new AbortController();

      try {
        const response = await fetch(
          `/api/interviews/${interviewId}/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, accessToken }),
            signal: abortRef.current.signal,
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "chunk") {
                fullResponse += event.content;
                setStreamingText(fullResponse);
              } else if (event.type === "done") {
                setQuestionsAsked(event.questionsAsked || 0);
                if (event.ended) {
                  setIsEnded(true);
                }
              } else if (event.type === "error") {
                setError(event.message);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Add the completed AI message
        if (fullResponse) {
          const aiMessage: Message = {
            id: `msg-${Date.now()}-ai`,
            role: "interviewer",
            content: fullResponse,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, aiMessage]);
          setStreamingText("");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Connection error");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [interviewId, accessToken]
  );

  const startInterview = useCallback(async () => {
    await streamRequest({ action: "start" });
  }, [streamRequest]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Optimistically add candidate message
      const candidateMessage: Message = {
        id: `msg-${Date.now()}-user`,
        role: "candidate",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, candidateMessage]);

      await streamRequest({ action: "respond", message: text.trim() });
    },
    [streamRequest, isStreaming]
  );

  const endInterview = useCallback(
    async (integrityEvents?: any[]) => {
      await streamRequest({
        action: "end",
        ...(integrityEvents ? { integrityEvents } : {}),
      });
    },
    [streamRequest]
  );

  const hydrateMessages = useCallback(
    (
      transcript: Array<{ role: string; content: string; timestamp?: string }>
    ) => {
      const restored: Message[] = transcript.map((entry, i) => ({
        id: `msg-restored-${i}`,
        role: entry.role as "interviewer" | "candidate",
        content: entry.content,
        timestamp: entry.timestamp || new Date().toISOString(),
      }));
      setMessages(restored);
      // Count questions from restored transcript
      let count = 0;
      for (let i = 1; i < transcript.length; i++) {
        if (
          transcript[i].role === "interviewer" &&
          transcript[i - 1].role === "candidate"
        ) {
          count++;
        }
      }
      setQuestionsAsked(count);
    },
    []
  );

  return {
    messages,
    isStreaming,
    streamingText,
    questionsAsked,
    error,
    isEnded,
    startInterview,
    sendMessage,
    endInterview,
    hydrateMessages,
  };
}

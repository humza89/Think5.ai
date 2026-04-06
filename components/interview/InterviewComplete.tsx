"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

interface InterviewCompleteProps {
  interviewId: string;
  accessToken: string;
}

type ReportStage = "generating" | "scoring" | "compiling" | "complete" | "failed";

export function InterviewComplete({
  interviewId,
  accessToken,
}: InterviewCompleteProps) {
  const [reportReady, setReportReady] = useState(false);
  const [stage, setStage] = useState<ReportStage>("generating");
  const [timedOut, setTimedOut] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Try SSE first, fall back to polling
  useEffect(() => {
    if (reportReady) return;

    // Attempt Server-Sent Events connection
    const sseUrl = `/api/interviews/${interviewId}/report-stream?token=${accessToken}`;
    let usePolling = false;

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.stage) setStage(data.stage as ReportStage);
          if (data.stage === "complete") {
            setReportReady(true);
            es.close();
          }
          if (data.stage === "failed") {
            es.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        usePolling = true;
        startPolling();
      };
    } catch {
      usePolling = true;
      startPolling();
    }

    // 5-minute timeout
    const timeout = setTimeout(() => {
      setTimedOut(true);
      eventSourceRef.current?.close();
    }, 5 * 60 * 1000);

    // Polling fallback
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/interviews/${interviewId}/report-status`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.ready) {
              setReportReady(true);
              if (pollInterval) clearInterval(pollInterval);
            }
            if (data.stage) setStage(data.stage as ReportStage);
          }
        } catch {
          // Retry on next interval
        }
      }, 10000); // 10s interval for polling (less aggressive than 5s)
    }

    if (usePolling) startPolling();

    return () => {
      clearTimeout(timeout);
      eventSourceRef.current?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [interviewId, accessToken, reportReady]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950">
      <div className="max-w-md w-full mx-4 text-center">
        {/* Checkmark */}
        <div className="mb-6 flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Interview Complete
        </h1>
        <p className="text-zinc-400 mb-8">
          Thank you for completing this interview. Your responses have been
          recorded and are being analyzed.
        </p>

        {/* Status */}
        {!reportReady && !timedOut && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
              <span className="text-zinc-300">
                {stage === "generating" && "Generating your assessment..."}
                {stage === "scoring" && "Scoring your responses..."}
                {stage === "compiling" && "Compiling your report..."}
                {stage === "failed" && "Report generation encountered an issue."}
              </span>
            </div>
            <p className="text-zinc-500 text-sm mt-3">
              This may take a minute. Your detailed report is being prepared.
            </p>
          </div>
        )}

        {timedOut && !reportReady && (
          <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6 mb-6">
            <p className="text-zinc-300 text-sm">
              Your assessment is taking longer than expected. You can safely close
              this window — your recruiter will notify you when results are ready.
            </p>
          </div>
        )}

        {reportReady && (
          <div className="bg-zinc-900 border border-green-500/30 rounded-xl p-6">
            <div className="flex items-center justify-center gap-3 mb-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-zinc-200 font-medium">
                Assessment Complete
              </span>
            </div>
            <p className="text-zinc-400 text-sm">
              Your recruiter will review your assessment shortly. You may close
              this window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

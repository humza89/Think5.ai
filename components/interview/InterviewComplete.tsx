"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

interface InterviewCompleteProps {
  interviewId: string;
  accessToken: string;
}

export function InterviewComplete({
  interviewId,
  accessToken,
}: InterviewCompleteProps) {
  const [reportReady, setReportReady] = useState(false);

  // Poll for report status every 5s
  useEffect(() => {
    if (reportReady) return;

    const interval = setInterval(async () => {
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
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000);

    return () => clearInterval(interval);
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
        {!reportReady && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
              <span className="text-zinc-300">
                Generating your assessment...
              </span>
            </div>
            <p className="text-zinc-500 text-sm mt-3">
              This may take a minute. Your detailed report is being prepared.
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

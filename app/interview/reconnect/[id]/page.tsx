/**
 * Interview Reconnect Page
 *
 * Guided recovery UX for candidates who were disconnected.
 * Shows partial progress, retry countdown, and support escalation.
 */

"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface InterviewStatus {
  id: string;
  status: string;
  progress: {
    questionsAnswered: number;
    totalQuestions: number;
    sectionsCompleted: number;
    totalSections: number;
    elapsedMinutes: number;
    remainingMinutes: number;
  };
  canReconnect: boolean;
}

export default function ReconnectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<InterviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(10);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [id]);

  // Auto-retry countdown
  useEffect(() => {
    if (!status?.canReconnect || isRetrying) return;

    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleReconnect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status?.canReconnect, isRetrying]);

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/interviews/${id}`);
      if (!res.ok) throw new Error("Failed to fetch interview status");
      const data = await res.json();

      const interview = data.interview;
      const transcript = interview.transcript || [];
      const sections = interview.sections || [];

      setStatus({
        id: interview.id,
        status: interview.status,
        progress: {
          questionsAnswered: transcript.filter(
            (m: { role: string }) => m.role === "user"
          ).length,
          totalQuestions: interview.estimatedQuestions || 20,
          sectionsCompleted: sections.filter(
            (s: { endedAt: string | null }) => s.endedAt !== null
          ).length,
          totalSections: sections.length || 5,
          elapsedMinutes: interview.startedAt
            ? Math.round(
                (Date.now() - new Date(interview.startedAt).getTime()) / 60000
              )
            : 0,
          remainingMinutes: interview.maxDurationMinutes
            ? interview.maxDurationMinutes -
              Math.round(
                (Date.now() - new Date(interview.startedAt).getTime()) / 60000
              )
            : 30,
        },
        canReconnect:
          interview.status === "DISCONNECTED" ||
          interview.status === "IN_PROGRESS",
      });
    } catch {
      setError("Unable to retrieve interview status. Please try again.");
    }
  }

  async function handleReconnect() {
    setIsRetrying(true);
    try {
      // Attempt to transition back to IN_PROGRESS
      const res = await fetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });

      if (res.ok) {
        router.push(`/interview/${id}`);
      } else {
        setError("Could not reconnect. The interview may have expired.");
        setIsRetrying(false);
      }
    } catch {
      setError("Connection failed. Please check your internet connection.");
      setIsRetrying(false);
      setRetryCountdown(10);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-8 shadow-lg dark:border-red-800 dark:bg-gray-800">
          <div className="mb-4 text-center text-4xl">!</div>
          <h2 className="mb-2 text-center text-xl font-semibold text-red-700 dark:text-red-400">
            Connection Issue
          </h2>
          <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {error}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setError(null);
                fetchStatus();
              }}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try Again
            </button>
            <a
              href={`mailto:support@paraform.com?subject=Interview%20Reconnect%20Issue&body=Interview%20ID:%20${id}`}
              className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Checking interview status...
          </p>
        </div>
      </div>
    );
  }

  if (!status.canReconnect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
          <h2 className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
            Interview Unavailable
          </h2>
          <p className="mb-4 text-center text-sm text-gray-600 dark:text-gray-400">
            This interview is in <strong>{status.status}</strong> state and
            cannot be resumed.
          </p>
          <a
            href={`mailto:support@paraform.com?subject=Interview%20Help&body=Interview%20ID:%20${id}%0AStatus:%20${status.status}`}
            className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            Contact Support for Help
          </a>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(
    (status.progress.questionsAnswered / status.progress.totalQuestions) * 100
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
        <h2 className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
          Reconnecting to Your Interview
        </h2>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Your progress has been saved. You can pick up right where you left
          off.
        </p>

        {/* Progress indicator */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {progressPercent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div>
              Questions: {status.progress.questionsAnswered}/
              {status.progress.totalQuestions}
            </div>
            <div>
              Sections: {status.progress.sectionsCompleted}/
              {status.progress.totalSections}
            </div>
            <div>Elapsed: {status.progress.elapsedMinutes}min</div>
            <div>Remaining: ~{Math.max(0, status.progress.remainingMinutes)}min</div>
          </div>
        </div>

        {/* Auto-reconnect */}
        <div className="space-y-3">
          <button
            onClick={handleReconnect}
            disabled={isRetrying}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isRetrying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Reconnecting...
              </span>
            ) : (
              `Reconnect Now (auto in ${retryCountdown}s)`
            )}
          </button>

          <a
            href={`mailto:support@paraform.com?subject=Interview%20Reconnect%20Help&body=Interview%20ID:%20${id}%0AStatus:%20${status.status}%0AProgress:%20${progressPercent}%25`}
            className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Need Help? Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

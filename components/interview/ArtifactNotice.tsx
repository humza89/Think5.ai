/**
 * Artifact Notice Component
 *
 * Displays mode-specific notice about what artifacts are captured
 * during the interview. Shown after consent, before first question.
 */

"use client";

import { useState } from "react";

interface ArtifactNoticeProps {
  mode: string;
  templateConfig: {
    screenShareRequired?: boolean;
    readinessCheckRequired?: boolean;
    durationMinutes?: number;
    retakePolicy?: {
      allowed?: boolean;
      cooldownDays?: number;
      maxRetakes?: number;
    };
    candidateReportPolicy?: {
      showTranscript?: boolean;
      showScores?: boolean;
      showStrengths?: boolean;
      showAreasToImprove?: boolean;
    };
  };
  isPractice?: boolean;
  retentionDays?: number;
  onAcknowledge: () => void;
}

export default function ArtifactNotice({
  mode,
  templateConfig,
  isPractice = false,
  retentionDays = 90,
  onAcknowledge,
}: ArtifactNoticeProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const artifacts = getArtifactsList(mode, templateConfig);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    onAcknowledge();
  };

  if (acknowledged) return null;

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-800 dark:bg-blue-950">
      <h3 className="mb-3 text-lg font-semibold text-blue-900 dark:text-blue-100">
        {isPractice ? "Practice Interview Notice" : "Interview Recording Notice"}
      </h3>

      {isPractice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          This is a practice session. Your responses will not be shared with
          recruiters or hiring managers.
        </div>
      )}

      <div className="mb-4 space-y-2 text-sm text-blue-800 dark:text-blue-200">
        <p className="font-medium">During this interview, the following will be captured:</p>
        <ul className="ml-4 list-disc space-y-1">
          {artifacts.map((artifact, i) => (
            <li key={i}>{artifact}</li>
          ))}
        </ul>
      </div>

      <div className="mb-4 space-y-2 text-sm text-blue-700 dark:text-blue-300">
        <p>
          <span className="font-medium">Who sees this: </span>
          {isPractice
            ? "Only you. Practice data is not shared."
            : "The recruiter who invited you and authorized hiring team members."}
        </p>
        <p>
          <span className="font-medium">Retention: </span>
          {isPractice
            ? "Practice data is deleted within 7 days."
            : `Your interview data is retained for ${retentionDays} days, after which it is automatically deleted unless a legal hold applies.`}
        </p>
        {templateConfig.candidateReportPolicy && !isPractice && (
          <p>
            <span className="font-medium">Your report access: </span>
            {templateConfig.candidateReportPolicy.showScores
              ? "You will receive a copy of your interview scores and feedback."
              : "You will be notified when your interview is reviewed."}
          </p>
        )}
      </div>

      <button
        onClick={handleAcknowledge}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        I understand, start the interview
      </button>
    </div>
  );
}

function getArtifactsList(
  mode: string,
  config: ArtifactNoticeProps["templateConfig"]
): string[] {
  const artifacts: string[] = [];

  // All modes capture transcript
  artifacts.push("Your text and voice responses (interview transcript)");

  // Voice modes
  if (
    mode === "VOICE" ||
    mode === "LIVE_VOICE" ||
    mode === "VOICE_ONLY" ||
    mode === "VIDEO_VOICE"
  ) {
    artifacts.push("Audio recording of the conversation");
  }

  // Video modes
  if (mode === "VIDEO_VOICE" || mode === "VIDEO") {
    artifacts.push("Video recording via your camera");
  }

  // Screen share
  if (config.screenShareRequired) {
    artifacts.push(
      "Screen sharing capture (periodic screenshots and/or recording)"
    );
  }

  // AI assessment
  artifacts.push(
    "AI-generated assessment scores across multiple dimensions"
  );
  artifacts.push("AI-generated report with strengths and areas for improvement");

  // Duration
  if (config.durationMinutes) {
    artifacts.push(
      `Expected duration: approximately ${config.durationMinutes} minutes`
    );
  }

  return artifacts;
}

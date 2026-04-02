"use client";

/**
 * ContinuityBadge — Recruiter-facing interview reliability indicator (Fix 10)
 *
 * Shows interview continuity grade as a colored badge:
 * - GREEN: "High Confidence" — no disruptions, reliable data
 * - YELLOW: "Minor Disruptions" — 1-2 gate violations, tooltip with details
 * - RED: "Reliability Warning" — resets, hallucinations, or >2 violations
 */

import { useState } from "react";

export type ContinuityGrade = "GREEN" | "YELLOW" | "RED";

interface ContinuityIncident {
  timestamp: string;
  type: string;
  detail: string;
  severity: string;
}

interface ContinuityBadgeProps {
  grade: ContinuityGrade | null | undefined;
  incidents?: ContinuityIncident[];
  memoryConfidenceMin?: number | null;
  className?: string;
}

const GRADE_CONFIG: Record<ContinuityGrade, { label: string; bgColor: string; textColor: string; borderColor: string; dotColor: string }> = {
  GREEN: {
    label: "High Confidence",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-200",
    dotColor: "bg-green-500",
  },
  YELLOW: {
    label: "Minor Disruptions",
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-200",
    dotColor: "bg-yellow-500",
  },
  RED: {
    label: "Reliability Warning",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    borderColor: "border-red-200",
    dotColor: "bg-red-500",
  },
};

export function ContinuityBadge({ grade, incidents, memoryConfidenceMin, className = "" }: ContinuityBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!grade || !GRADE_CONFIG[grade]) return null;

  const config = GRADE_CONFIG[grade];
  const incidentCount = incidents?.length ?? 0;

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={() => grade !== "GREEN" && incidentCount > 0 && setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor} ${grade !== "GREEN" && incidentCount > 0 ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        title={grade === "GREEN" ? "No disruptions detected during this interview" : `${incidentCount} incident${incidentCount !== 1 ? "s" : ""} detected`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
        {config.label}
        {grade !== "GREEN" && incidentCount > 0 && (
          <span className="ml-0.5 opacity-60">({incidentCount})</span>
        )}
      </button>

      {expanded && incidents && incidents.length > 0 && (
        <div className={`mt-2 p-3 rounded-lg border ${config.borderColor} ${config.bgColor} text-xs`}>
          <div className="space-y-1.5">
            {incidents.slice(0, 10).map((incident, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 w-1 h-1 rounded-full flex-shrink-0 ${incident.severity === "critical" ? "bg-red-500" : incident.severity === "warning" ? "bg-yellow-500" : "bg-gray-400"}`} />
                <div>
                  <span className="font-medium">{incident.type}</span>
                  {incident.detail && <span className="ml-1 opacity-70">— {incident.detail}</span>}
                </div>
              </div>
            ))}
            {incidents.length > 10 && (
              <div className="opacity-60">...and {incidents.length - 10} more</div>
            )}
          </div>
          {typeof memoryConfidenceMin === "number" && (
            <div className="mt-2 pt-2 border-t border-current/10">
              Min memory confidence: <span className="font-mono font-medium">{(memoryConfidenceMin * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

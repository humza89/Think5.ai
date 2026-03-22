"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreCircle } from "./ScoreCircle";
import { RecommendationBadge } from "./RecommendationBadge";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Shield,
  MessageSquare,
  Printer,
  Share2,
  Copy,
  Loader2,
  Target,
  Eye,
  Lightbulb,
  TrendingUp,
  Briefcase,
} from "lucide-react";

interface SkillRating {
  skill: string;
  rating: number;
  description: string;
  evidence: string;
}

interface SoftSkillRating {
  skill: string;
  rating: number;
  description: string;
}

interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp?: string;
}

interface IntegrityEvent {
  type: string;
  description: string;
  timestamp: string;
}

interface RiskSignal {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  evidence: string;
  confidence: string;
}

interface HypothesisOutcome {
  hypothesis: string;
  outcome: "confirmed" | "refuted" | "inconclusive";
  evidence: string;
}

interface EvidenceHighlight {
  type: "strength" | "concern" | "contradiction" | "impressive";
  summary: string;
  transcriptRange?: { startIdx: number; endIdx: number };
}

interface RequirementMatch {
  skillName: string;
  importance: "REQUIRED" | "PREFERRED" | "NICE_TO_HAVE";
  matchLevel: "met" | "partially_met" | "not_met" | "not_assessed";
  evidence: string;
}

interface ReportData {
  overallScore: number | null;
  recommendation: string | null;
  summary: string | null;
  technicalSkills: SkillRating[] | null;
  softSkills: SoftSkillRating[] | null;
  domainExpertise: number | null;
  clarityStructure: number | null;
  problemSolving: number | null;
  communicationScore: number | null;
  measurableImpact: number | null;
  strengths: string[] | null;
  areasToImprove: string[] | null;
  hiringAdvice: string | null;
  integrityScore: number | null;
  integrityFlags: any[] | null;
  // Phase 1 enhanced fields
  headline: string | null;
  confidenceLevel: string | null;
  professionalExperience: number | null;
  roleFit: number | null;
  culturalFit: number | null;
  thinkingJudgment: number | null;
  riskSignals: RiskSignal[] | null;
  hypothesisOutcomes: HypothesisOutcome[] | null;
  evidenceHighlights: EvidenceHighlight[] | null;
  jobMatchScore: number | null;
  requirementMatches: RequirementMatch[] | null;
  environmentFitNotes: string | null;
}

interface InterviewReportViewerProps {
  report: ReportData;
  candidateName: string;
  candidateTitle: string | null;
  interviewType: string;
  interviewDate: string;
  transcript: TranscriptEntry[] | null;
  integrityEvents: IntegrityEvent[] | null;
  interviewId?: string; // Optional — only needed for share functionality
  recordingUrl?: string;
}

export function InterviewReportViewer({
  report,
  candidateName,
  candidateTitle,
  interviewType,
  interviewDate,
  transcript,
  integrityEvents,
  interviewId,
  recordingUrl,
}: InterviewReportViewerProps) {
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptSectionRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [highlightedRange, setHighlightedRange] = useState<{ startIdx: number; endIdx: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [recordingUrl]);

  const seekToTimestamp = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  }, []);

  const handleShare = async () => {
    if (!interviewId) return;
    setShareLoading(true);
    try {
      const res = await fetch(
        `/api/interviews/${interviewId}/report/share`,
        { method: "POST" }
      );
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.shareUrl);
        navigator.clipboard.writeText(data.shareUrl);
      }
    } catch {
      // ignore
    } finally {
      setShareLoading(false);
    }
  };
  const typeLabel = interviewType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{candidateName}</h1>
          {candidateTitle && (
            <p className="text-gray-500 mt-1">{candidateTitle}</p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <Badge variant="outline">{typeLabel}</Badge>
            <span className="text-sm text-gray-500">
              {new Date(interviewDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {report.overallScore != null && (
            <ScoreCircle score={report.overallScore} size="lg" label="Overall" />
          )}
          {report.recommendation && (
            <RecommendationBadge
              recommendation={report.recommendation}
              size="lg"
            />
          )}
          {/* F2: Share Report */}
          {interviewId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={shareLoading}
              className="no-print"
            >
              {shareLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : shareUrl ? (
                <Copy className="w-4 h-4 mr-2" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              {shareUrl ? "Link Copied!" : "Share Report"}
            </Button>
          )}
          {/* F1: PDF Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (interviewId) {
                window.open(`/api/interviews/${interviewId}/report/pdf`, "_blank");
              } else {
                window.print();
              }
            }}
            className="no-print"
          >
            <Printer className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Headline & Confidence */}
      {(report.headline || report.confidenceLevel) && (
        <Card>
          <CardContent className="pt-6">
            {report.headline && (
              <p className="text-lg font-medium text-gray-800 leading-relaxed">
                {report.headline}
              </p>
            )}
            {report.confidenceLevel && (
              <div className="flex items-center gap-2 mt-3">
                <Eye className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Assessment Confidence:</span>
                <Badge
                  variant="outline"
                  className={
                    report.confidenceLevel === "HIGH"
                      ? "border-green-300 text-green-700 bg-green-50"
                      : report.confidenceLevel === "MEDIUM"
                        ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                        : "border-red-300 text-red-700 bg-red-50"
                  }
                >
                  {report.confidenceLevel}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Executive Summary */}
      {report.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {report.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dimension Scores */}
      <Card>
        <CardHeader>
          <CardTitle>Dimension Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <DimensionBar label="Domain Expertise" value={report.domainExpertise} />
            <DimensionBar label="Clarity & Structure" value={report.clarityStructure} />
            <DimensionBar label="Problem Solving" value={report.problemSolving} />
            <DimensionBar label="Communication" value={report.communicationScore} />
            <DimensionBar label="Measurable Impact" value={report.measurableImpact} />
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Dimension Scores (Phase 1) */}
      {(report.professionalExperience != null || report.roleFit != null || report.culturalFit != null || report.thinkingJudgment != null) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Assessment Dimensions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <DimensionBar label="Professional Experience" value={report.professionalExperience} />
              <DimensionBar label="Thinking & Judgment" value={report.thinkingJudgment} />
              <DimensionBar label="Cultural Fit" value={report.culturalFit} />
              <DimensionBar label="Role Fit" value={report.roleFit} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job-Fit Section (JOB_FIT / HYBRID modes) */}
      {(report.jobMatchScore != null || (report.requirementMatches && report.requirementMatches.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-500" />
              Job Fit Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.jobMatchScore != null && (
                <DimensionBar label="Job Match Score" value={report.jobMatchScore} />
              )}
              {report.requirementMatches && report.requirementMatches.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500 mb-3">Requirement Analysis</p>
                  <div className="space-y-2">
                    {report.requirementMatches.map((match, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm border rounded-lg px-3 py-2">
                        <span className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                          match.matchLevel === "met" ? "bg-green-500" :
                          match.matchLevel === "partially_met" ? "bg-yellow-500" :
                          match.matchLevel === "not_met" ? "bg-red-500" : "bg-gray-300"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{match.skillName}</span>
                            <Badge variant="outline" className="text-xs">
                              {match.importance.replace(/_/g, " ")}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                match.matchLevel === "met" ? "border-green-300 text-green-700" :
                                match.matchLevel === "partially_met" ? "border-yellow-300 text-yellow-700" :
                                match.matchLevel === "not_met" ? "border-red-300 text-red-700" :
                                "border-gray-300 text-gray-500"
                              }`}
                            >
                              {match.matchLevel.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          {match.evidence && (
                            <p className="text-gray-500 text-xs mt-1">{match.evidence}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {report.environmentFitNotes && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">Environment Fit</p>
                  <p className="text-sm text-blue-700">{report.environmentFitNotes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Skills */}
      {report.technicalSkills && report.technicalSkills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Technical Skills Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.technicalSkills.map((skill, i) => (
                <SkillCard key={i} skill={skill} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Soft Skills */}
      {report.softSkills && report.softSkills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Soft Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.softSkills.map((skill, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm font-medium w-40 text-gray-700">
                    {skill.skill}
                  </span>
                  <div className="flex-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${(skill.rating / 10) * 100}%`,
                          backgroundColor: getSkillColor(skill.rating),
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold w-8 text-right">
                    {skill.rating}/10
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths & Areas to Improve */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {report.strengths && report.strengths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-gray-700"
                  >
                    <span className="text-green-500 mt-0.5">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {report.areasToImprove && report.areasToImprove.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Areas to Improve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.areasToImprove.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-gray-700"
                  >
                    <span className="text-amber-500 mt-0.5">!</span>
                    {a}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hiring Advice */}
      {report.hiringAdvice && (
        <Card>
          <CardHeader>
            <CardTitle>Hiring Advice</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed">
              {report.hiringAdvice}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Hypothesis Outcomes */}
      {report.hypothesisOutcomes && report.hypothesisOutcomes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              Hypothesis Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.hypothesisOutcomes.map((h, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 flex-shrink-0 w-3 h-3 rounded-full ${
                      h.outcome === "confirmed" ? "bg-green-500" :
                      h.outcome === "refuted" ? "bg-red-500" : "bg-yellow-500"
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {h.hypothesis}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            h.outcome === "confirmed" ? "border-green-300 text-green-700 bg-green-50" :
                            h.outcome === "refuted" ? "border-red-300 text-red-700 bg-red-50" :
                            "border-yellow-300 text-yellow-700 bg-yellow-50"
                          }`}
                        >
                          {h.outcome}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{h.evidence}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Highlights */}
      {report.evidenceHighlights && report.evidenceHighlights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Key Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.evidenceHighlights.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 text-sm rounded-lg px-3 py-2 ${
                    e.type === "strength" ? "bg-green-50 border border-green-200" :
                    e.type === "impressive" ? "bg-purple-50 border border-purple-200" :
                    e.type === "concern" ? "bg-amber-50 border border-amber-200" :
                    "bg-red-50 border border-red-200"
                  }`}
                >
                  <span className={`mt-0.5 flex-shrink-0 ${
                    e.type === "strength" ? "text-green-500" :
                    e.type === "impressive" ? "text-purple-500" :
                    e.type === "concern" ? "text-amber-500" :
                    "text-red-500"
                  }`}>
                    {e.type === "strength" ? "+" :
                     e.type === "impressive" ? "\u2605" :
                     e.type === "concern" ? "!" : "\u26A0"}
                  </span>
                  <div className="flex-1">
                    <Badge variant="outline" className="text-xs mb-1">
                      {e.type}
                    </Badge>
                    <p className="text-gray-700">{e.summary}</p>
                  </div>
                  {e.transcriptRange && transcript && (
                    <button
                      onClick={() => {
                        setHighlightedRange(e.transcriptRange!);
                        transcriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap flex-shrink-0 mt-1"
                      title="Jump to transcript"
                    >
                      View in transcript →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Signals */}
      {report.riskSignals && report.riskSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Risk Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.riskSignals.map((r, i) => (
                <div key={i} className="flex items-start gap-3 text-sm border border-red-100 bg-red-50/50 rounded-lg px-3 py-2">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    r.severity === "HIGH" ? "text-red-500" :
                    r.severity === "MEDIUM" ? "text-amber-500" : "text-yellow-500"
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          r.severity === "HIGH" ? "border-red-300 text-red-700 bg-red-50" :
                          r.severity === "MEDIUM" ? "border-amber-300 text-amber-700 bg-amber-50" :
                          "border-yellow-300 text-yellow-700 bg-yellow-50"
                        }`}
                      >
                        {r.severity}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {r.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-gray-700">{r.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrity Section */}
      {(report.integrityScore != null || (integrityEvents && integrityEvents.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              Interview Integrity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.integrityScore != null && (
                <DimensionBar label="Integrity Score" value={report.integrityScore} />
              )}
              {integrityEvents && integrityEvents.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-sm font-medium text-gray-500">
                    Flagged Events ({integrityEvents.length})
                  </p>
                  {integrityEvents.map((event, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-gray-700">
                        {event.description}
                      </span>
                      <span className="text-gray-400 text-xs ml-auto">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {(!integrityEvents || integrityEvents.length === 0) && (
                <p className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  No integrity events flagged
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video + Transcript */}
      {transcript && transcript.length > 0 && (
        recordingUrl ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:sticky lg:top-6 lg:self-start">
              <Card>
                <CardContent className="p-4">
                  <video
                    ref={videoRef}
                    src={recordingUrl}
                    controls
                    className="w-full rounded-lg"
                  />
                </CardContent>
              </Card>
            </div>
            <div ref={transcriptSectionRef}>
              <TranscriptSection
                transcript={transcript}
                currentTime={currentTime}
                onTimestampClick={seekToTimestamp}
                highlightedRange={highlightedRange}
                onClearHighlight={() => setHighlightedRange(null)}
              />
            </div>
          </div>
        ) : (
          <div ref={transcriptSectionRef}>
            <TranscriptSection
              transcript={transcript}
              highlightedRange={highlightedRange}
              onClearHighlight={() => setHighlightedRange(null)}
            />
          </div>
        )
      )}
    </div>
  );
}

// Sub-components

function DimensionBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value == null) return null;

  const color =
    value >= 80
      ? "bg-green-500"
      : value >= 60
        ? "bg-blue-500"
        : value >= 40
          ? "bg-yellow-500"
          : "bg-red-500";

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium w-40 text-gray-700">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-sm font-bold w-12 text-right">{value}/100</span>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillRating }) {
  const color = getSkillColor(skill.rating);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{skill.skill}</span>
        <span className="font-bold text-lg" style={{ color }}>
          {skill.rating}/10
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(skill.rating / 10) * 100}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <p className="text-sm text-gray-600 mb-2">{skill.description}</p>
      {skill.evidence && (
        <blockquote className="text-xs text-gray-500 border-l-2 border-gray-200 pl-3 italic">
          &ldquo;{skill.evidence}&rdquo;
        </blockquote>
      )}
    </div>
  );
}

/**
 * Parse a timestamp string into total seconds.
 * Supports "MM:SS", "HH:MM:SS", or ISO date strings (extracts time-of-day offset from first entry).
 */
function parseTimestampToSeconds(timestamp: string): number {
  // Handle "MM:SS" or "HH:MM:SS" format
  const colonParts = timestamp.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (colonParts) {
    if (colonParts[3] !== undefined) {
      // HH:MM:SS
      return (
        parseInt(colonParts[1], 10) * 3600 +
        parseInt(colonParts[2], 10) * 60 +
        parseInt(colonParts[3], 10)
      );
    }
    // MM:SS
    return parseInt(colonParts[1], 10) * 60 + parseInt(colonParts[2], 10);
  }

  // Try parsing as a date and extract seconds from midnight
  const date = new Date(timestamp);
  if (!isNaN(date.getTime())) {
    return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  }

  return 0;
}

function TranscriptSection({
  transcript,
  currentTime,
  onTimestampClick,
  highlightedRange,
  onClearHighlight,
}: {
  transcript: TranscriptEntry[];
  currentTime?: number;
  onTimestampClick?: (seconds: number) => void;
  highlightedRange?: { startIdx: number; endIdx: number } | null;
  onClearHighlight?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-expand transcript when evidence is highlighted
  useEffect(() => {
    if (highlightedRange) setExpanded(true);
  }, [highlightedRange]);

  // Determine which entry is currently active based on video time
  const activeIndex =
    currentTime != null
      ? (() => {
          let active = -1;
          for (let i = 0; i < transcript.length; i++) {
            const ts = transcript[i].timestamp;
            if (!ts) continue;
            const sec = parseTimestampToSeconds(ts);
            if (sec <= currentTime) active = i;
            else break;
          }
          return active;
        })()
      : -1;

  // Auto-scroll to active entry
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIndex]);

  const hasVideo = onTimestampClick != null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-500" />
            Interview Transcript
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" /> Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" /> Expand
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {highlightedRange && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                <span className="text-yellow-700">Showing highlighted evidence (entries #{highlightedRange.startIdx}–#{highlightedRange.endIdx})</span>
                <button onClick={onClearHighlight} className="text-yellow-500 hover:text-yellow-700 ml-auto">✕ Clear</button>
              </div>
            )}
            {transcript.map((entry, i) => {
              const isActive = i === activeIndex;
              const isHighlighted = highlightedRange && i >= highlightedRange.startIdx && i <= highlightedRange.endIdx;
              return (
                <div
                  key={i}
                  ref={isActive ? activeRef : undefined}
                  className={`flex gap-3 ${
                    entry.role === "interviewer" ? "" : "justify-end"
                  }`}
                >
                  {entry.role === "interviewer" && (
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex-shrink-0 flex items-center justify-center">
                      <span className="text-violet-600 font-bold text-xs">
                        A
                      </span>
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-3 transition-colors duration-200 ${
                      isHighlighted
                        ? "bg-yellow-50 border-2 border-yellow-400 shadow-sm ring-1 ring-yellow-300"
                        : isActive
                          ? "bg-blue-50 border-2 border-blue-300 shadow-sm"
                          : entry.role === "interviewer"
                            ? "bg-gray-50 border"
                            : "bg-blue-50 border border-blue-100"
                    }`}
                  >
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {entry.content}
                    </p>
                    {entry.timestamp && (
                      <span
                        className={`text-xs mt-1 block ${
                          hasVideo
                            ? "text-blue-500 hover:text-blue-700 cursor-pointer hover:underline"
                            : "text-gray-400"
                        }`}
                        onClick={
                          hasVideo && entry.timestamp
                            ? () =>
                                onTimestampClick(
                                  parseTimestampToSeconds(entry.timestamp!)
                                )
                            : undefined
                        }
                      >
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {entry.role === "candidate" && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-xs">C</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function getSkillColor(rating: number): string {
  if (rating >= 9) return "#8b5cf6"; // purple — exceptional
  if (rating >= 7) return "#22c55e"; // green — exceeds
  if (rating >= 4) return "#eab308"; // yellow — meets
  return "#ef4444"; // red — below
}

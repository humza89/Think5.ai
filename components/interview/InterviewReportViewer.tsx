"use client";

import { useState } from "react";
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
}: InterviewReportViewerProps) {
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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
            onClick={() => window.print()}
            className="no-print"
          >
            <Printer className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

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

      {/* Transcript */}
      {transcript && transcript.length > 0 && (
        <TranscriptSection transcript={transcript} />
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

function TranscriptSection({
  transcript,
}: {
  transcript: TranscriptEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

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
            {transcript.map((entry, i) => (
              <div
                key={i}
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
                  className={`max-w-[75%] ${
                    entry.role === "interviewer"
                      ? "bg-gray-50 border"
                      : "bg-blue-50 border border-blue-100"
                  } rounded-lg px-4 py-3`}
                >
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {entry.content}
                  </p>
                  {entry.timestamp && (
                    <span className="text-xs text-gray-400 mt-1 block">
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
            ))}
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

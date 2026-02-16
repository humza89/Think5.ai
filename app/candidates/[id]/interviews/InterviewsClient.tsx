"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink, FileText } from "lucide-react";
import { ScheduleInterviewDialog } from "@/components/interview/ScheduleInterviewDialog";
import Link from "next/link";

interface Report {
  id: string;
  overallScore: number | null;
  recommendation: string | null;
  summary: string | null;
  domainExpertise: number | null;
  problemSolving: number | null;
  communicationScore: number | null;
  strengths: any;
  areasToImprove: any;
}

interface Interview {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  invitedEmail: string | null;
  report: Report | null;
}

interface InterviewsClientProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  initialInterviews: Interview[];
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-300",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-300",
  EXPIRED: "bg-red-100 text-red-800 border-red-300",
};

const RECOMMENDATION_STYLES: Record<string, string> = {
  STRONG_YES: "bg-green-100 text-green-800",
  YES: "bg-blue-100 text-blue-800",
  MAYBE: "bg-yellow-100 text-yellow-800",
  NO: "bg-orange-100 text-orange-800",
  STRONG_NO: "bg-red-100 text-red-800",
};

export default function InterviewsClient({
  candidateId,
  candidateName,
  candidateEmail,
  initialInterviews,
}: InterviewsClientProps) {
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleScheduled = (newInterview: Interview) => {
    setInterviews((prev) => [newInterview, ...prev]);
    setDialogOpen(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Interviews</h2>
          <p className="text-sm text-gray-500">
            {interviews.length} interview{interviews.length !== 1 ? "s" : ""}{" "}
            scheduled
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Schedule Interview
        </Button>
      </div>

      {/* Interview list */}
      {interviews.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-gray-900 font-medium mb-1">No interviews yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Schedule an AI interview to assess this candidate
          </p>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Schedule Interview
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {interviews.map((interview) => (
            <InterviewCard key={interview.id} interview={interview} />
          ))}
        </div>
      )}

      {/* Schedule dialog */}
      <ScheduleInterviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidateId={candidateId}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        onScheduled={handleScheduled}
      />
    </div>
  );
}

function InterviewCard({ interview }: { interview: Interview }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = interview.type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const statusClass = STATUS_STYLES[interview.status] || STATUS_STYLES.PENDING;

  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={statusClass}>
            {interview.status.replace(/_/g, " ")}
          </Badge>
          <span className="font-medium text-gray-900">{typeLabel}</span>
          <span className="text-sm text-gray-500">
            {new Date(interview.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Overall score */}
          {interview.report?.overallScore != null && (
            <div className="flex items-center gap-2">
              <ScoreCircleMini score={interview.report.overallScore} />
            </div>
          )}

          {/* Recommendation badge */}
          {interview.report?.recommendation && (
            <Badge
              className={
                RECOMMENDATION_STYLES[interview.report.recommendation] ||
                "bg-gray-100 text-gray-800"
              }
            >
              {interview.report.recommendation.replace(/_/g, " ")}
            </Badge>
          )}

          {/* View report link */}
          {interview.report && (
            <Link href={`/interviews/${interview.id}/report`}>
              <Button variant="ghost" size="sm">
                <ExternalLink className="w-4 h-4 mr-1" />
                Report
              </Button>
            </Link>
          )}

          {/* Expand summary */}
          {interview.report?.summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Less" : "More"}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded report summary */}
      {expanded && interview.report && (
        <div className="mt-4 pt-4 border-t">
          {interview.report.summary && (
            <p className="text-sm text-gray-700 mb-3">
              {interview.report.summary}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 text-sm">
            {interview.report.domainExpertise != null && (
              <div>
                <span className="text-gray-500">Domain Expertise</span>
                <div className="font-medium">
                  {interview.report.domainExpertise}/100
                </div>
              </div>
            )}
            {interview.report.problemSolving != null && (
              <div>
                <span className="text-gray-500">Problem Solving</span>
                <div className="font-medium">
                  {interview.report.problemSolving}/100
                </div>
              </div>
            )}
            {interview.report.communicationScore != null && (
              <div>
                <span className="text-gray-500">Communication</span>
                <div className="font-medium">
                  {interview.report.communicationScore}/100
                </div>
              </div>
            )}
          </div>

          {interview.report.strengths && (
            <div className="mt-3">
              <span className="text-xs font-medium text-gray-500 uppercase">
                Strengths
              </span>
              <ul className="mt-1 space-y-1">
                {(Array.isArray(interview.report.strengths)
                  ? interview.report.strengths
                  : []
                )
                  .slice(0, 3)
                  .map((s: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-green-500">+</span> {s}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreCircleMini({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-green-600"
      : score >= 60
        ? "text-blue-600"
        : score >= 40
          ? "text-yellow-600"
          : "text-red-600";

  return (
    <div
      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm ${color}`}
      style={{
        borderColor: "currentColor",
      }}
    >
      {score}
    </div>
  );
}

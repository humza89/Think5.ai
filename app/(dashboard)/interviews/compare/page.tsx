"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreCircle } from "@/components/interview/ScoreCircle";
import { RecommendationBadge } from "@/components/interview/RecommendationBadge";
import { Loader2 } from "lucide-react";

interface CompareReport {
  id: string;
  type: string;
  candidate: {
    fullName: string;
    currentTitle: string | null;
    profileImage: string | null;
  };
  report: {
    overallScore: number | null;
    recommendation: string | null;
    domainExpertise: number | null;
    clarityStructure: number | null;
    problemSolving: number | null;
    communicationScore: number | null;
    measurableImpact: number | null;
    strengths: string[];
    areasToImprove: string[];
    summary: string;
  } | null;
}

const DIMENSIONS = [
  { key: "domainExpertise", label: "Domain Expertise" },
  { key: "clarityStructure", label: "Clarity & Structure" },
  { key: "problemSolving", label: "Problem Solving" },
  { key: "communicationScore", label: "Communication" },
  { key: "measurableImpact", label: "Measurable Impact" },
] as const;

const COLORS = ["#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b"];

export default function ComparePage() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",") || [];
  const [interviews, setInterviews] = useState<CompareReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/interviews/${id}`);
            if (res.ok) return res.json();
            return null;
          })
        );
        setInterviews(results.filter(Boolean));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    if (ids.length >= 2) {
      fetchAll();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (interviews.length < 2) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Select 2-4 Interviews to Compare
          </h1>
          <p className="text-gray-500 mb-4">
            Use the checkboxes on the interviews dashboard to select candidates.
          </p>
          <Link href="/interviews" className="text-blue-600 hover:underline">
            Back to Interviews
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
          <Link
            href="/interviews"
            className="text-sm text-blue-600 hover:underline"
          >
            &larr; Back to Interviews
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-8">
          Candidate Comparison ({interviews.length})
        </h1>

        {/* Candidate headers */}
        <div className="overflow-x-auto">
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: `repeat(${interviews.length}, 1fr)`, minWidth: `${interviews.length * 250}px` }}>
          {interviews.map((interview, idx) => (
            <Card key={interview.id}>
              <CardContent className="pt-6 text-center">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                >
                  {interview.candidate.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <h3 className="font-semibold text-gray-900">
                  {interview.candidate.fullName}
                </h3>
                <p className="text-sm text-gray-500">
                  {interview.candidate.currentTitle || "No title"}
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  {interview.report?.overallScore != null && (
                    <ScoreCircle
                      score={interview.report.overallScore}
                      size="sm"
                    />
                  )}
                  {interview.report?.recommendation && (
                    <RecommendationBadge
                      recommendation={interview.report.recommendation}
                      size="sm"
                    />
                  )}
                </div>
                <Badge variant="outline" className="mt-2">
                  {interview.type.replace(/_/g, " ")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        </div>

        {/* Dimension comparison bars */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Dimension Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {DIMENSIONS.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                  </p>
                  <div className="space-y-1.5">
                    {interviews.map((interview, idx) => {
                      const value = interview.report?.[key] ?? null;
                      return (
                        <div key={interview.id} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-32 truncate">
                            {interview.candidate.fullName}
                          </span>
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                            {value != null && (
                              <div
                                className="h-full rounded-full transition-all duration-1000"
                                style={{
                                  width: `${value}%`,
                                  backgroundColor: COLORS[idx % COLORS.length],
                                }}
                              />
                            )}
                          </div>
                          <span className="text-sm font-bold w-12 text-right">
                            {value != null ? `${Math.round(value)}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Strengths comparison */}
        <div className="overflow-x-auto">
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: `repeat(${interviews.length}, 1fr)`, minWidth: `${interviews.length * 250}px` }}>
          {interviews.map((interview) => (
            <Card key={`strengths-${interview.id}`}>
              <CardHeader>
                <CardTitle className="text-sm">
                  {interview.candidate.fullName} — Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                {interview.report?.strengths?.length ? (
                  <ul className="space-y-1.5">
                    {(interview.report.strengths as string[]).map((s, i) => (
                      <li
                        key={i}
                        className="text-sm text-gray-700 flex gap-2"
                      >
                        <span className="text-green-500">+</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">No report available</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        </div>

        {/* Areas to improve comparison */}
        <div className="overflow-x-auto">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${interviews.length}, 1fr)`, minWidth: `${interviews.length * 250}px` }}>
          {interviews.map((interview) => (
            <Card key={`improve-${interview.id}`}>
              <CardHeader>
                <CardTitle className="text-sm">
                  {interview.candidate.fullName} — Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent>
                {interview.report?.areasToImprove?.length ? (
                  <ul className="space-y-1.5">
                    {(interview.report.areasToImprove as string[]).map(
                      (a, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 flex gap-2"
                        >
                          <span className="text-amber-500">!</span>
                          {a}
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">No report available</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
    </div>
  );
}

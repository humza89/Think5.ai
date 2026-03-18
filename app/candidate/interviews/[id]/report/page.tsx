"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { InterviewReportViewer } from "@/components/interview/InterviewReportViewer";
import { ArrowLeft } from "lucide-react";

interface ReportPageData {
  report: {
    overallScore: number | null;
    recommendation: string | null;
    summary: string | null;
    technicalSkills: unknown;
    softSkills: unknown;
    domainExpertise: number | null;
    clarityStructure: number | null;
    problemSolving: number | null;
    communicationScore: number | null;
    measurableImpact: number | null;
    strengths: string[] | null;
    areasToImprove: string[] | null;
    integrityScore: number | null;
    integrityFlags: unknown[] | null;
  };
  candidateName: string;
  candidateTitle: string | null;
  interviewType: string;
  interviewDate: string;
  transcript: unknown;
  integrityEvents: unknown;
}

export default function CandidateReportPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<ReportPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`/api/candidate/interviews/${id}/report`);
        if (!res.ok) {
          const body = await res.json();
          setError(body.error || "Failed to load report");
          return;
        }
        const reportData = await res.json();
        setData(reportData);
      } catch {
        setError("Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id]);

  return (
    <div>
        <div className="container mx-auto px-6">
          <Link
            href="/candidate/interviews"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Interviews
          </Link>

          {loading ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <div className="w-8 h-8 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading report...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-12 text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <p className="text-sm text-muted-foreground">
                The report may not be ready yet. Please try again later.
              </p>
            </div>
          ) : data ? (
            <InterviewReportViewer
              report={data.report as any}
              candidateName={data.candidateName}
              candidateTitle={data.candidateTitle}
              interviewType={data.interviewType}
              interviewDate={data.interviewDate}
              transcript={data.transcript as any}
              integrityEvents={data.integrityEvents as any}
              // No interviewId — hides Share button (recruiter-only)
            />
          ) : null}
        </div>
    </div>
  );
}

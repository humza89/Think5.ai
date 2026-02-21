"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  FileText,
  ExternalLink,
  ArrowLeft,
  Filter,
} from "lucide-react";

interface Interview {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  accessToken: string | null;
  duration: number | null;
  candidate: { fullName: string; currentTitle: string | null };
  report: {
    overallScore: number | null;
    recommendation: string | null;
    createdAt: string;
  } | null;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  IN_PROGRESS: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  COMPLETED: "bg-green-400/10 text-green-400 border-green-400/20",
  CANCELLED: "bg-red-400/10 text-red-400 border-red-400/20",
  EXPIRED: "bg-white/10 text-white/40 border-white/10",
};

const filters = ["all", "PENDING", "COMPLETED", "IN_PROGRESS", "CANCELLED"];

export default function CandidateInterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    async function fetchInterviews() {
      setLoading(true);
      try {
        const url =
          activeFilter === "all"
            ? "/api/candidate/interviews"
            : `/api/candidate/interviews?status=${activeFilter}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setInterviews(data.interviews || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, [activeFilter]);

  return (
    <main className="min-h-screen bg-black">
      <Header />

      <div className="pt-28 pb-24">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/candidate/dashboard"
              className="inline-flex items-center text-sm text-white/50 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
            </Link>
            <h1 className="text-4xl font-bold text-white mb-2">
              Your Interviews
            </h1>
            <p className="text-white/50">
              View all your interviews and their results.
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-8 flex-wrap">
            <Filter className="w-4 h-4 text-white/40 mr-1" />
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                  activeFilter === f
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                }`}
              >
                {f === "all" ? "All" : f.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Interviews List */}
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/40">Loading interviews...</p>
            </div>
          ) : interviews.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <ClipboardList className="w-10 h-10 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white/60 mb-2">
                No interviews found
              </h3>
              <p className="text-sm text-white/40">
                {activeFilter === "all"
                  ? "You haven't been invited to any interviews yet."
                  : `No ${activeFilter.toLowerCase().replace("_", " ")} interviews.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-medium text-lg">
                        {interview.type.replace("_", " ")} Interview
                      </span>
                      <Badge
                        variant="outline"
                        className={statusColors[interview.status]}
                      >
                        {interview.status}
                      </Badge>
                      {interview.report?.overallScore != null && (
                        <Badge
                          className={
                            interview.report.overallScore >= 70
                              ? "bg-green-400/10 text-green-400 border-green-400/20"
                              : interview.report.overallScore >= 50
                              ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                              : "bg-red-400/10 text-red-400 border-red-400/20"
                          }
                        >
                          Score: {Math.round(interview.report.overallScore)}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span>
                        Created{" "}
                        {new Date(interview.createdAt).toLocaleDateString()}
                      </span>
                      {interview.completedAt && (
                        <span>
                          Completed{" "}
                          {new Date(
                            interview.completedAt
                          ).toLocaleDateString()}
                        </span>
                      )}
                      {interview.duration && (
                        <span>
                          {Math.round(interview.duration / 60)} min
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {interview.status === "PENDING" &&
                      interview.accessToken && (
                        <Link
                          href={`/interview/${interview.id}?token=${interview.accessToken}`}
                        >
                          <Button
                            size="sm"
                            className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Take Interview
                          </Button>
                        </Link>
                      )}
                    {interview.status === "COMPLETED" &&
                      interview.report && (
                        <Link
                          href={`/candidate/interviews/${interview.id}/report`}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/10 rounded-lg"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            View Report
                          </Button>
                        </Link>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}

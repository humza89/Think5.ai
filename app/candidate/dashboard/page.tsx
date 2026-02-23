"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  BarChart3,
  Clock,
  CheckCircle,
  ArrowRight,
  User,
  FileText,
  ExternalLink,
  Briefcase,
  Send,
} from "lucide-react";

interface Interview {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  accessToken: string | null;
  candidate: { fullName: string; currentTitle: string | null };
  report: { overallScore: number | null; recommendation: string | null; createdAt: string } | null;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  IN_PROGRESS: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  COMPLETED: "bg-green-400/10 text-green-400 border-green-400/20",
  CANCELLED: "bg-red-400/10 text-red-400 border-red-400/20",
  EXPIRED: "bg-white/10 text-white/40 border-white/10",
};

export default function CandidateDashboard() {
  const { profile } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInterviews() {
      try {
        const res = await fetch("/api/candidate/interviews");
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
  }, []);

  const pending = interviews.filter((i) => i.status === "PENDING");
  const completed = interviews.filter((i) => i.status === "COMPLETED");
  const avgScore =
    completed.length > 0
      ? completed.reduce((sum, i) => sum + (i.report?.overallScore || 0), 0) /
        completed.filter((i) => i.report?.overallScore).length
      : 0;

  return (
    <main className="min-h-screen bg-black">
      <Header />

      <div className="pt-28 pb-24">
        <div className="container mx-auto px-6">
          {/* Welcome */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white">
                Welcome back{profile ? `, ${profile.first_name}` : ""}
              </h1>
              <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/20">
                Candidate
              </Badge>
            </div>
            <p className="text-white/50">
              Track your interviews, view reports, and manage your profile.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: ClipboardList, label: "Total Interviews", value: interviews.length },
              { icon: CheckCircle, label: "Completed", value: completed.length },
              { icon: BarChart3, label: "Avg Score", value: avgScore ? `${Math.round(avgScore)}%` : "—" },
              { icon: Clock, label: "Pending", value: pending.length },
            ].map((stat, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <stat.icon className="w-5 h-5 text-blue-400 mb-3" />
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-white/40 uppercase tracking-wide mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Upcoming Interviews */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Upcoming Interviews
                </h2>
                <Link
                  href="/candidate/interviews"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/40 text-sm">Loading...</p>
                </div>
              ) : pending.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                  <Clock className="w-8 h-8 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">No pending interviews</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.slice(0, 5).map((interview) => (
                    <div
                      key={interview.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-5 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">
                            {interview.type.replace("_", " ")} Interview
                          </span>
                          <Badge
                            variant="outline"
                            className={statusColors[interview.status]}
                          >
                            {interview.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/40">
                          Scheduled{" "}
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {interview.accessToken && (
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Results */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Recent Results
                </h2>
                <Link
                  href="/candidate/interviews"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/40 text-sm">Loading...</p>
                </div>
              ) : completed.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                  <BarChart3 className="w-8 h-8 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">
                    No completed interviews yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completed.slice(0, 5).map((interview) => (
                    <div
                      key={interview.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-5 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">
                            {interview.type.replace("_", " ")} Interview
                          </span>
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
                              {Math.round(interview.report.overallScore)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-white/40">
                          Completed{" "}
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {interview.report && (
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
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/candidate/jobs"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.07] transition-colors flex items-center gap-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Browse Jobs</h3>
                <p className="text-xs text-white/40">
                  Discover new opportunities
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
            </Link>
            <Link
              href="/candidate/applications"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.07] transition-colors flex items-center gap-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">My Applications</h3>
                <p className="text-xs text-white/40">
                  Track your application status
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
            </Link>
            <Link
              href="/candidate/interviews"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.07] transition-colors flex items-center gap-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">All Interviews</h3>
                <p className="text-xs text-white/40">
                  View your full interview history
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
            </Link>
            <Link
              href="/candidate/profile"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.07] transition-colors flex items-center gap-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Your Profile</h3>
                <p className="text-xs text-white/40">
                  Manage your profile information
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

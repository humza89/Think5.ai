"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Briefcase,
  Users,
  MessageSquare,
  TrendingUp,
  Target,
  CheckCircle,
  BarChart3,
  Loader2,
} from "lucide-react";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </ProtectedRoute>
    );
  }

  const overview = data?.overview || {};
  const funnel = data?.funnel || {};

  const funnelSteps = [
    { label: "Applied", count: funnel.applied || 0, color: "bg-blue-500" },
    { label: "Screening", count: funnel.screening || 0, color: "bg-purple-500" },
    { label: "Interviewing", count: funnel.interviewing || 0, color: "bg-yellow-500" },
    { label: "Shortlisted", count: funnel.shortlisted || 0, color: "bg-cyan-500" },
    { label: "Offered", count: funnel.offered || 0, color: "bg-orange-500" },
    { label: "Hired", count: funnel.hired || 0, color: "bg-green-500" },
  ];

  const maxFunnel = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">
              Overview of your recruiting performance
            </p>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Active Jobs</p>
                    <p className="text-3xl font-bold">{overview.activeJobs || 0}</p>
                  </div>
                  <Briefcase className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Applications</p>
                    <p className="text-3xl font-bold">{overview.totalApplications || 0}</p>
                  </div>
                  <Users className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Interview Completion</p>
                    <p className="text-3xl font-bold">{overview.interviewCompletion || 0}%</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-purple-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Hires</p>
                    <p className="text-3xl font-bold">{overview.recentHires || 0}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-emerald-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hiring Funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  Hiring Funnel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {funnelSteps.map((step, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{step.label}</span>
                        <span className="text-sm font-bold text-gray-900">{step.count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${step.color} transition-all`}
                          style={{ width: `${(step.count / maxFunnel) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Overview Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  Platform Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: "Total Jobs", value: overview.totalJobs || 0, icon: Briefcase },
                    { label: "Total Candidates", value: overview.totalCandidates || 0, icon: Users },
                    { label: "Total Interviews", value: overview.totalInterviews || 0, icon: MessageSquare },
                    { label: "Completed Interviews", value: overview.completedInterviews || 0, icon: CheckCircle },
                    { label: "AI Matches", value: overview.totalMatches || 0, icon: TrendingUp },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{item.label}</span>
                      </div>
                      <span className="text-lg font-bold text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Application Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Application Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(data?.applicationsByStatus || []).map((item: any) => (
                    <div key={item.status} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-600">{item.status.replace("_", " ")}</span>
                      <span className="text-sm font-bold text-gray-900">{item.count}</span>
                    </div>
                  ))}
                  {(data?.applicationsByStatus || []).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Interview Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Interview Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(data?.interviewsByStatus || []).map((item: any) => (
                    <div key={item.status} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-600">{item.status.replace("_", " ")}</span>
                      <span className="text-sm font-bold text-gray-900">{item.count}</span>
                    </div>
                  ))}
                  {(data?.interviewsByStatus || []).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

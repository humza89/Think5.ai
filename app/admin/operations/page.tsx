"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Monitor,
  Video,
  Mic,
  RefreshCw,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface OperationsData {
  overview: {
    totalInterviews: number;
    completedInterviews: number;
    completionRate: number;
    reportSuccessRate: number;
    failedReports: number;
    retriedReports: number;
    incompleteTranscripts: number;
  };
  reportStatus: { status: string; count: number }[];
  voiceProviders: { provider: string; count: number }[];
  recordingPipeline: { state: string; count: number }[];
  proctoringEvents: { severity: string; count: number }[];
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-blue-100 text-blue-800",
};

const REPORT_STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  generating: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  unknown: "bg-gray-100 text-gray-800",
};

const RECORDING_STATE_COLORS: Record<string, string> = {
  UPLOADING: "bg-blue-100 text-blue-800",
  FINALIZING: "bg-yellow-100 text-yellow-800",
  COMPLETE: "bg-green-100 text-green-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  DELETED: "bg-gray-100 text-gray-800",
};

export default function OperationsDashboard() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/operations");
      if (!res.ok) throw new Error("Failed to fetch operations data");
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Interview Operations</h1>
        <p className="text-gray-500">Loading operations data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Interview Operations</h1>
        <p className="text-red-600">{error || "No data available"}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Interview Operations</h1>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Interviews
            </CardTitle>
            <Activity className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.overview.totalInterviews}</div>
            <p className="text-xs text-gray-500 mt-1">
              {data.overview.completionRate}% completion rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Report Success Rate
            </CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.overview.reportSuccessRate}%</div>
            <p className="text-xs text-gray-500 mt-1">
              {data.overview.failedReports} failed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Retried Reports
            </CardTitle>
            <RefreshCw className="w-4 h-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.overview.retriedReports}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Missing Transcripts
            </CardTitle>
            <FileWarning className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.overview.incompleteTranscripts}</div>
            <p className="text-xs text-gray-500 mt-1">
              Completed interviews with no transcript
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report generation + Voice providers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Report Generation Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.reportStatus.map((r) => (
                <div key={r.status} className="flex items-center justify-between">
                  <Badge className={REPORT_STATUS_COLORS[r.status] || "bg-gray-100 text-gray-800"}>
                    {r.status}
                  </Badge>
                  <span className="text-sm font-medium">{r.count}</span>
                </div>
              ))}
              {data.reportStatus.length === 0 && (
                <p className="text-sm text-gray-500">No report data</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Voice vs Text Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.voiceProviders.map((v) => (
                <div key={v.provider} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {v.provider === "gemini-live" ? (
                      <Mic className="w-4 h-4 text-purple-500" />
                    ) : (
                      <Monitor className="w-4 h-4 text-blue-500" />
                    )}
                    <span className="text-sm">
                      {v.provider === "gemini-live" ? "Voice (Gemini Live)" : "Text (SSE)"}
                    </span>
                  </div>
                  <span className="text-sm font-medium">{v.count}</span>
                </div>
              ))}
              {data.voiceProviders.length === 0 && (
                <p className="text-sm text-gray-500">No completed interviews</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recording pipeline + Proctoring events */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="w-4 h-4" />
              Recording Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recordingPipeline.map((r) => (
                <div key={r.state} className="flex items-center justify-between">
                  <Badge className={RECORDING_STATE_COLORS[r.state] || "bg-gray-100 text-gray-800"}>
                    {r.state}
                  </Badge>
                  <span className="text-sm font-medium">{r.count}</span>
                </div>
              ))}
              {data.recordingPipeline.length === 0 && (
                <p className="text-sm text-gray-500">No recordings</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Proctoring Events by Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.proctoringEvents.map((p) => (
                <div key={p.severity} className="flex items-center justify-between">
                  <Badge className={SEVERITY_COLORS[p.severity] || "bg-gray-100 text-gray-800"}>
                    {p.severity}
                  </Badge>
                  <span className="text-sm font-medium">{p.count}</span>
                </div>
              ))}
              {data.proctoringEvents.length === 0 && (
                <p className="text-sm text-gray-500">No proctoring events</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  MapPin,
  Briefcase,
  Clock,
  FileText,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  APPLIED: { label: "Applied", className: "bg-blue-100 text-blue-700" },
  SCREENING: { label: "Screening", className: "bg-purple-100 text-purple-700" },
  INTERVIEWING: { label: "Interviewing", className: "bg-yellow-100 text-yellow-700" },
  SHORTLISTED: { label: "Shortlisted", className: "bg-cyan-100 text-cyan-700" },
  OFFERED: { label: "Offered", className: "bg-orange-100 text-orange-700" },
  HIRED: { label: "Hired", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Not Selected", className: "bg-red-100 text-red-700" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-gray-100 text-gray-700" },
};

export default function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate/applications");
      if (!res.ok) {
        throw new Error(`Failed to load applications (${res.status})`);
      }
      const data = await res.json();
      setApplications(data.applications || []);
    } catch (err) {
      console.error("Error fetching applications:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load applications"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">My Applications</h1>
          <p className="text-gray-500 mt-1">Track the status of your job applications</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : error ? (
          <Card className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Something went wrong
            </h3>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchApplications}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </Card>
        ) : applications.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applications yet</h3>
            <p className="text-gray-500 mb-4">Start applying to jobs to see your applications here</p>
            <Link
              href="/candidate/jobs"
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Browse Jobs
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((app: any) => {
              const status = statusConfig[app.status] || statusConfig.APPLIED;
              return (
                <Link key={app.id} href={`/candidate/jobs/${app.job.id}`}>
                  <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">{app.job.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {app.job.company.name}
                          </span>
                          {app.job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {app.job.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className={status.className}>{status.label}</Badge>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(app.appliedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

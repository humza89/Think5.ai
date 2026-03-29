"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";

interface SharedReport {
  id: string;
  shareToken: string | null;
  shareExpiresAt: string | null;
  recipientEmail: string | null;
  sharePurpose: string | null;
  overallScore: number | null;
  recommendation: string | null;
  createdAt: string;
  interview: {
    id: string;
    type: string;
    candidate: { fullName: string; email: string } | null;
  };
  views: { viewedAt: string; viewerIp: string }[];
  _count: { views: number };
}

const REC_COLORS: Record<string, string> = {
  STRONG_HIRE: "text-emerald-400",
  HIRE: "text-green-400",
  LEAN_HIRE: "text-lime-400",
  NO_DECISION: "text-zinc-400",
  LEAN_NO_HIRE: "text-amber-400",
  NO_HIRE: "text-red-400",
  STRONG_NO_HIRE: "text-red-500",
};

export default function AdminSharedReportsPage() {
  const [reports, setReports] = useState<SharedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shared-reports");
      if (!res.ok) throw new Error("Failed to fetch shared reports");
      const data = await res.json();
      setReports(data.sharedReports || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load shared reports");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(report: SharedReport) {
    setRevokingId(report.id);
    const revokePromise = (async () => {
      const res = await fetch(
        `/api/interviews/${report.interview.id}/report/share/revoke`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke");
      }
    })();

    toast.promise(revokePromise, {
      loading: "Revoking shared link...",
      success: "Shared report link revoked",
      error: (err) => err instanceof Error ? err.message : "Revoke failed",
    });

    try {
      await revokePromise;
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch {
      // error shown via toast
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Shared Reports</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Monitor and manage all actively shared interview reports
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          Back to Admin
        </Link>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-3 mb-6 text-sm">
        <Link href="/admin/interview-templates" className="text-zinc-400 hover:text-white">Templates</Link>
        <Link href="/admin/interview-analytics" className="text-zinc-400 hover:text-white">Analytics</Link>
        <Link href="/admin/shared-reports" className="text-violet-400 font-medium">Shared Reports</Link>
        <Link href="/admin/hm-memberships" className="text-zinc-400 hover:text-white">HM Memberships</Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchReports}
            className="mt-3 text-sm text-red-300 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">No actively shared reports found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Candidate
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Recipient
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Shared
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Views
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Score
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Recommendation
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Expires
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">
                        {report.interview.candidate?.fullName || "Unknown"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {report.interview.type}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {report.recipientEmail || "--"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-300">
                      {report._count.views}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-white font-medium">
                        {report.overallScore != null ? report.overallScore : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          REC_COLORS[report.recommendation || ""] || "text-zinc-400"
                        }`}
                      >
                        {report.recommendation
                          ? report.recommendation.replace(/_/g, " ")
                          : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {report.shareExpiresAt
                        ? new Date(report.shareExpiresAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(report)}
                        disabled={revokingId === report.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                      >
                        {revokingId === report.id ? "Revoking..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

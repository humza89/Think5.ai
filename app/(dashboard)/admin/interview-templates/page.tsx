"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  status: string;
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  updatedAt: string;
  company: { id: string; name: string } | null;
  recruiter: { id: string; name: string } | null;
  _count: { interviews: number; invitations: number };
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-700 text-zinc-300",
  PENDING_APPROVAL: "bg-amber-900/50 text-amber-400",
  ACTIVE: "bg-emerald-900/50 text-emerald-400",
  ARCHIVED: "bg-red-900/50 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export default function AdminInterviewTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [filterStatus]);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/admin/templates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusTransition(templateId: string, newStatus: string) {
    setActionLoading(templateId);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          status: newStatus,
          approvalNotes: notesMap[templateId] || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Transition failed");
      }
      setShowNotesFor(null);
      setNotesMap((prev) => ({ ...prev, [templateId]: "" }));
      await fetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  function renderActions(template: Template) {
    const isLoading = actionLoading === template.id;
    const btnBase =
      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50";

    switch (template.status) {
      case "DRAFT":
        return (
          <button
            className={`${btnBase} bg-amber-600 hover:bg-amber-500 text-white`}
            disabled={isLoading}
            onClick={() => handleStatusTransition(template.id, "PENDING_APPROVAL")}
          >
            {isLoading ? "Submitting..." : "Submit for Approval"}
          </button>
        );
      case "PENDING_APPROVAL":
        return (
          <div className="flex flex-col gap-2">
            {showNotesFor === template.id && (
              <textarea
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                rows={2}
                placeholder="Approval/rejection notes (optional)"
                value={notesMap[template.id] || ""}
                onChange={(e) =>
                  setNotesMap((prev) => ({ ...prev, [template.id]: e.target.value }))
                }
              />
            )}
            <div className="flex gap-2">
              <button
                className={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white`}
                disabled={isLoading}
                onClick={() => {
                  if (showNotesFor !== template.id) {
                    setShowNotesFor(template.id);
                    return;
                  }
                  handleStatusTransition(template.id, "ACTIVE");
                }}
              >
                {isLoading ? "Approving..." : "Approve"}
              </button>
              <button
                className={`${btnBase} bg-red-600 hover:bg-red-500 text-white`}
                disabled={isLoading}
                onClick={() => {
                  if (showNotesFor !== template.id) {
                    setShowNotesFor(template.id);
                    return;
                  }
                  handleStatusTransition(template.id, "DRAFT");
                }}
              >
                {isLoading ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        );
      case "ACTIVE":
        return (
          <button
            className={`${btnBase} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
            disabled={isLoading}
            onClick={() => handleStatusTransition(template.id, "ARCHIVED")}
          >
            {isLoading ? "Archiving..." : "Archive"}
          </button>
        );
      case "ARCHIVED":
        return (
          <button
            className={`${btnBase} bg-violet-600 hover:bg-violet-500 text-white`}
            disabled={isLoading}
            onClick={() => handleStatusTransition(template.id, "DRAFT")}
          >
            {isLoading ? "Reactivating..." : "Reactivate"}
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Template Governance</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage interview template approval workflows
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
        <Link href="/admin/interview-templates" className="text-violet-400 font-medium">Templates</Link>
        <Link href="/admin/interview-analytics" className="text-zinc-400 hover:text-white">Analytics</Link>
        <Link href="/admin/shared-reports" className="text-zinc-400 hover:text-white">Shared Reports</Link>
        <Link href="/admin/hm-memberships" className="text-zinc-400 hover:text-white">HM Memberships</Link>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6">
        {["", "DRAFT", "PENDING_APPROVAL", "ACTIVE", "ARCHIVED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterStatus === s
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700"
            }`}
          >
            {s ? STATUS_LABELS[s] : "All"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchTemplates}
            className="mt-3 text-sm text-red-300 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">No templates found{filterStatus ? ` with status "${STATUS_LABELS[filterStatus]}"` : ""}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-medium truncate">{template.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        STATUS_COLORS[template.status] || "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {STATUS_LABELS[template.status] || template.status}
                    </span>
                    {template.version > 1 && (
                      <span className="text-xs text-zinc-500">v{template.version}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    {template.company && (
                      <span>Company: {template.company.name}</span>
                    )}
                    {template.recruiter && (
                      <span>Recruiter: {template.recruiter.name}</span>
                    )}
                    <span>Interviews: {template._count.interviews}</span>
                    <span>Invitations: {template._count.invitations}</span>
                    <span>
                      Updated: {new Date(template.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {template.approvalNotes && (
                    <p className="mt-2 text-xs text-zinc-400 italic">
                      Notes: {template.approvalNotes}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">{renderActions(template)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  CheckCircle,
  Clock,
  ExternalLink,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Send,
  Copy,
  XCircle,
  FileText,
  Loader2,
  ArrowUpDown,
} from "lucide-react";

interface Interview {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  invitedEmail: string | null;
  accessToken: string | null;
  candidate: {
    id: string;
    fullName: string;
    profileImage: string | null;
    currentTitle: string | null;
  };
  report: {
    id: string;
    overallScore: number | null;
    recommendation: string | null;
  } | null;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  EXPIRED: "bg-red-100 text-red-800",
};

const RECOMMENDATION_STYLES: Record<string, string> = {
  STRONG_YES: "bg-green-100 text-green-800",
  YES: "bg-blue-100 text-blue-800",
  MAYBE: "bg-yellow-100 text-yellow-800",
  NO: "bg-orange-100 text-orange-800",
  STRONG_NO: "bg-red-100 text-red-800",
};

export default function InterviewsDashboard() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // F3: Compare selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/interviews?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.interviews);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch interviews:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, searchQuery, sortBy, sortOrder, dateFrom, dateTo]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 300);
  };

  // Sort toggle
  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  // Stats
  const totalPages = Math.ceil(total / pageSize);

  // E5: Re-send invite
  const handleResendInvite = async (interviewId: string) => {
    setActionLoading(`resend-${interviewId}`);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to re-send invite");
      } else {
        toast.success("Invite re-sent successfully");
      }
    } catch {
      toast.error("Failed to re-send invite");
    } finally {
      setActionLoading(null);
    }
  };

  // E5: Copy interview link
  const handleCopyLink = (interview: Interview) => {
    if (!interview.accessToken) return;
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/interview/${interview.id}?token=${interview.accessToken}`;
    navigator.clipboard.writeText(url);
    setCopiedId(interview.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // E6: Cancel interview
  const handleCancel = async (interviewId: string) => {
    if (!confirm("Cancel this interview? This cannot be undone.")) return;
    setActionLoading(`cancel-${interviewId}`);
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (res.ok) {
        toast.success("Interview cancelled");
        fetchInterviews();
      }
    } catch {
      toast.error("Failed to cancel interview");
    } finally {
      setActionLoading(null);
    }
  };

  // E7: Generate report
  const handleGenerateReport = async (interviewId: string) => {
    setActionLoading(`report-${interviewId}`);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/report`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Report generation started");
        setTimeout(fetchInterviews, 2000);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate report");
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold mb-8">Interviews</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Interviews
              </CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completed
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {interviews.filter((i) => i.status === "COMPLETED").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Score
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(() => {
                  const scored = interviews.filter(
                    (i) => i.report?.overallScore != null
                  );
                  if (scored.length === 0) return "—";
                  return Math.round(
                    scored.reduce(
                      (sum, i) => sum + (i.report!.overallScore || 0),
                      0
                    ) / scored.length
                  );
                })()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completion Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {total > 0
                  ? Math.round(
                      (interviews.filter((i) => i.status === "COMPLETED")
                        .length /
                        interviews.length) *
                        100
                    )
                  : 0}
                %
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* E2: Search */}
          <div className="relative">
            <label htmlFor="interviews-search" className="sr-only">Search interviews</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="interviews-search"
              placeholder="Search candidates..."
              className="pl-9 w-[220px]"
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="TECHNICAL">Technical</SelectItem>
              <SelectItem value="BEHAVIORAL">Behavioral</SelectItem>
              <SelectItem value="DOMAIN_EXPERT">Domain Expert</SelectItem>
              <SelectItem value="LANGUAGE">Language</SelectItem>
              <SelectItem value="CASE_STUDY">Case Study</SelectItem>
            </SelectContent>
          </Select>

          {/* E4: Date range */}
          <Input
            type="date"
            className="w-[160px]"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            placeholder="From"
          />
          <Input
            type="date"
            className="w-[160px]"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            placeholder="To"
          />

          {/* E3: Sort */}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() => toggleSort("createdAt")}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Date {sortBy === "createdAt" ? (sortOrder === "desc" ? "↓" : "↑") : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() => toggleSort("overallScore")}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Score {sortBy === "overallScore" ? (sortOrder === "desc" ? "↓" : "↑") : ""}
          </Button>

          {/* F3: Compare button */}
          {selectedIds.size >= 2 && (
            <Link
              href={`/interviews/compare?ids=${Array.from(selectedIds).join(",")}`}
            >
              <Button size="sm" className="ml-auto">
                Compare ({selectedIds.size})
              </Button>
            </Link>
          )}
        </div>

        {/* Interview list */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-gray-300" />
            Loading interviews...
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No interviews found</p>
            <p className="text-sm mt-1">
              Schedule interviews from candidate profiles
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {interviews.map((interview) => (
              <div
                key={interview.id}
                className="bg-white border rounded-lg p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-4">
                  {/* F3: Compare checkbox */}
                  {interview.report && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(interview.id)}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(interview.id)) {
                            next.delete(interview.id);
                          } else if (next.size < 4) {
                            next.add(interview.id);
                          }
                          return next;
                        });
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {interview.candidate.profileImage ? (
                      <img
                        src={interview.candidate.profileImage}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-600 font-medium text-sm">
                        {interview.candidate.fullName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                    )}
                  </div>

                  <div>
                    <Link
                      href={`/candidates/${interview.candidate.id}/interviews`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {interview.candidate.fullName}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {interview.candidate.currentTitle || "No title"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <Badge
                    variant="outline"
                    className="bg-gray-50 text-gray-700"
                  >
                    {interview.type.replace(/_/g, " ")}
                  </Badge>

                  <Badge
                    className={
                      STATUS_STYLES[interview.status] ||
                      "bg-gray-100 text-gray-800"
                    }
                  >
                    {interview.status.replace(/_/g, " ")}
                  </Badge>

                  <span className="text-sm text-gray-500 w-24 text-right">
                    {new Date(interview.createdAt).toLocaleDateString()}
                  </span>

                  {interview.report?.overallScore != null && (
                    <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center font-bold text-sm text-blue-600">
                      {Math.round(interview.report.overallScore)}
                    </div>
                  )}

                  {interview.report?.recommendation && (
                    <Badge
                      className={
                        RECOMMENDATION_STYLES[
                          interview.report.recommendation
                        ] || "bg-gray-100 text-gray-800"
                      }
                    >
                      {interview.report.recommendation.replace(/_/g, " ")}
                    </Badge>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    {/* E5: Re-send invite (PENDING only) */}
                    {interview.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResendInvite(interview.id)}
                        disabled={actionLoading === `resend-${interview.id}`}
                        title="Re-send invite"
                      >
                        {actionLoading === `resend-${interview.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    )}

                    {/* E5: Copy link (PENDING with token) */}
                    {interview.status === "PENDING" &&
                      interview.accessToken && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(interview)}
                          title="Copy interview link"
                        >
                          {copiedId === interview.id ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}

                    {/* E6: Cancel (PENDING only) */}
                    {interview.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(interview.id)}
                        disabled={actionLoading === `cancel-${interview.id}`}
                        title="Cancel interview"
                        className="text-red-500 hover:text-red-600"
                      >
                        {actionLoading === `cancel-${interview.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </Button>
                    )}

                    {/* E7: Generate report (COMPLETED without report) */}
                    {interview.status === "COMPLETED" && !interview.report && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateReport(interview.id)}
                        disabled={actionLoading === `report-${interview.id}`}
                        title="Generate report"
                      >
                        {actionLoading === `report-${interview.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </Button>
                    )}

                    {/* View report */}
                    {interview.report && (
                      <Link href={`/interviews/${interview.id}/report`}>
                        <Button variant="ghost" size="sm" title="View report">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* E1: Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} of {total} interviews
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum =
                  totalPages <= 5
                    ? i + 1
                    : page <= 3
                      ? i + 1
                      : page >= totalPages - 2
                        ? totalPages - 4 + i
                        : page - 2 + i;
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className="w-9"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
    </>
  );
}

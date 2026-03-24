"use client";

import { useState, useEffect, useCallback } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ApprovalStatusBadge } from "@/components/approvals/ApprovalStatusBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  PauseCircle,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FileText,
  Settings2,
  Clock,
  MapPin,
  Phone,
  Mail,
  Building2,
  Globe,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ApprovalCandidate,
  ApprovalCandidateDetail,
  ApprovalsListResponse,
  ApprovalActionType,
  ApprovalRecruiter,
  ApprovalRecruiterDetail,
  RecruiterApprovalsListResponse,
} from "@/types/approvals";

type ApprovalType = "candidates" | "recruiters";
type StatusFilter = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ON_HOLD" | "all";
type RecruiterStatusFilter = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "all";

const CANDIDATE_TABS: { value: StatusFilter; label: string; countKey: keyof ApprovalsListResponse["counts"] }[] = [
  { value: "PENDING_APPROVAL", label: "Pending", countKey: "pending" },
  { value: "APPROVED", label: "Approved", countKey: "approved" },
  { value: "REJECTED", label: "Rejected", countKey: "rejected" },
  { value: "ON_HOLD", label: "On Hold", countKey: "onHold" },
  { value: "all", label: "All", countKey: "all" },
];

const RECRUITER_TABS: { value: RecruiterStatusFilter; label: string; countKey: keyof RecruiterApprovalsListResponse["counts"] }[] = [
  { value: "PENDING_APPROVAL", label: "Pending", countKey: "pending" },
  { value: "APPROVED", label: "Approved", countKey: "approved" },
  { value: "REJECTED", label: "Rejected", countKey: "rejected" },
  { value: "all", label: "All", countKey: "all" },
];

export default function ApprovalsPage() {
  const [approvalType, setApprovalType] = useState<ApprovalType>("candidates");

  // Candidate state
  const [data, setData] = useState<ApprovalsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING_APPROVAL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);

  // Recruiter state
  const [recruiterData, setRecruiterData] = useState<RecruiterApprovalsListResponse | null>(null);
  const [recruiterLoading, setRecruiterLoading] = useState(true);
  const [recruiterStatusFilter, setRecruiterStatusFilter] = useState<RecruiterStatusFilter>("PENDING_APPROVAL");
  const [recruiterSearch, setRecruiterSearch] = useState("");
  const [recruiterSearchInput, setRecruiterSearchInput] = useState("");
  const [recruiterSort, setRecruiterSort] = useState("createdAt");
  const [recruiterOrder, setRecruiterOrder] = useState("desc");
  const [recruiterPage, setRecruiterPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Candidate preview sheet
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ApprovalCandidateDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Recruiter preview sheet
  const [recruiterPreviewId, setRecruiterPreviewId] = useState<string | null>(null);
  const [recruiterPreviewData, setRecruiterPreviewData] = useState<ApprovalRecruiterDetail | null>(null);
  const [recruiterPreviewLoading, setRecruiterPreviewLoading] = useState(false);

  // Reject dialog
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    candidateId?: string;
    candidateIds?: string[];
    recruiterId?: string;
    bulk?: boolean;
  }>({ open: false });
  const [rejectReason, setRejectReason] = useState("");

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // ============================================
  // Candidate fetching
  // ============================================
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        search,
        sort,
        order,
        page: String(page),
        limit: "20",
      });
      const res = await fetch(`/api/admin/approvals?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApprovalsListResponse = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, sort, order, page]);

  useEffect(() => {
    if (approvalType === "candidates") {
      fetchCandidates();
    }
  }, [fetchCandidates, approvalType]);

  useEffect(() => {
    if (approvalType === "candidates") {
      setSelected(new Set());
      setPage(1);
    }
  }, [statusFilter, search, approvalType]);

  // ============================================
  // Recruiter fetching
  // ============================================
  const fetchRecruiters = useCallback(async () => {
    setRecruiterLoading(true);
    try {
      const params = new URLSearchParams({
        type: "recruiters",
        status: recruiterStatusFilter,
        search: recruiterSearch,
        sort: recruiterSort,
        order: recruiterOrder,
        page: String(recruiterPage),
        limit: "20",
      });
      const res = await fetch(`/api/admin/approvals?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: RecruiterApprovalsListResponse = await res.json();
      setRecruiterData(json);
    } catch {
      toast.error("Failed to load recruiters");
    } finally {
      setRecruiterLoading(false);
    }
  }, [recruiterStatusFilter, recruiterSearch, recruiterSort, recruiterOrder, recruiterPage]);

  useEffect(() => {
    if (approvalType === "recruiters") {
      fetchRecruiters();
    }
  }, [fetchRecruiters, approvalType]);

  useEffect(() => {
    if (approvalType === "recruiters") {
      setSelected(new Set());
      setRecruiterPage(1);
    }
  }, [recruiterStatusFilter, recruiterSearch, approvalType]);

  // ============================================
  // Candidate preview
  // ============================================
  async function openPreview(id: string) {
    setPreviewId(id);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/approvals/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setPreviewData(await res.json());
    } catch {
      toast.error("Failed to load candidate details");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewData(null);
  }

  // ============================================
  // Recruiter preview
  // ============================================
  async function openRecruiterPreview(id: string) {
    setRecruiterPreviewId(id);
    setRecruiterPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/approvals/${id}?type=recruiter`);
      if (!res.ok) throw new Error("Failed to fetch");
      setRecruiterPreviewData(await res.json());
    } catch {
      toast.error("Failed to load recruiter details");
    } finally {
      setRecruiterPreviewLoading(false);
    }
  }

  function closeRecruiterPreview() {
    setRecruiterPreviewId(null);
    setRecruiterPreviewData(null);
  }

  // ============================================
  // Candidate actions
  // ============================================
  async function handleAction(candidateId: string, action: ApprovalActionType, reason?: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/approvals/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(
        action === "approved"
          ? "Candidate approved"
          : action === "rejected"
            ? "Candidate rejected"
            : "Candidate put on hold"
      );
      closePreview();
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkAction(action: ApprovalActionType, reason?: string) {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/approvals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          action,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const result = await res.json();
      toast.success(`${result.updated} candidate(s) updated`);
      setSelected(new Set());
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================
  // Recruiter actions
  // ============================================
  async function handleRecruiterAction(recruiterId: string, action: ApprovalActionType, reason?: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/approvals/${recruiterId}?type=recruiter`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(
        action === "approved"
          ? "Recruiter approved"
          : action === "rejected"
            ? "Recruiter rejected"
            : "Recruiter put on hold"
      );
      closeRecruiterPreview();
      fetchRecruiters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================
  // Reject dialog handler
  // ============================================
  function handleRejectConfirm() {
    if (!rejectReason.trim()) return;
    if (rejectDialog.bulk && rejectDialog.candidateIds) {
      handleBulkAction("rejected", rejectReason.trim());
    } else if (rejectDialog.recruiterId) {
      handleRecruiterAction(rejectDialog.recruiterId, "rejected", rejectReason.trim());
    } else if (rejectDialog.candidateId) {
      handleAction(rejectDialog.candidateId, "rejected", rejectReason.trim());
    }
    setRejectDialog({ open: false });
    setRejectReason("");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (approvalType === "candidates") {
      setSearch(searchInput);
    } else {
      setRecruiterSearch(recruiterSearchInput);
    }
  }

  // Selection helpers (candidates)
  const allOnPageSelected =
    data?.candidates.length
      ? data.candidates.every((c) => selected.has(c.id))
      : false;

  function toggleSelectAll() {
    if (!data) return;
    if (allOnPageSelected) {
      const next = new Set(selected);
      data.candidates.forEach((c) => next.delete(c.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      data.candidates.forEach((c) => next.add(c.id));
      setSelected(next);
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // ============================================
  // Switch approval type handler
  // ============================================
  function switchApprovalType(type: ApprovalType) {
    setApprovalType(type);
    setSelected(new Set());
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {approvalType === "candidates" ? "Candidate" : "Recruiter"} Approvals
            </h1>
            <p className="text-sm text-muted-foreground">
              Review and manage {approvalType === "candidates" ? "candidate profiles" : "recruiter accounts"} pending approval
            </p>
          </div>
        </div>

        {/* Approval Type Toggle */}
        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          <button
            onClick={() => switchApprovalType("candidates")}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              approvalType === "candidates"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            Candidates
          </button>
          <button
            onClick={() => switchApprovalType("recruiters")}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              approvalType === "recruiters"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            Recruiters
          </button>
        </div>

        {/* ============================================ */}
        {/* CANDIDATES VIEW */}
        {/* ============================================ */}
        {approvalType === "candidates" && (
          <>
            {/* Status Tabs */}
            <div className="flex flex-wrap gap-2">
              {CANDIDATE_TABS.map((tab) => {
                const count = data?.counts[tab.countKey] ?? 0;
                const isActive = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {tab.label}
                    <Badge
                      variant={isActive ? "secondary" : "outline"}
                      className="ml-1 min-w-[24px] justify-center text-xs"
                    >
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or title..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Search
                </Button>
              </form>

              <div className="flex items-center gap-2">
                <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date</SelectItem>
                    <SelectItem value="fullName">Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
                >
                  {order === "asc" ? "A→Z" : "Z→A"}
                </Button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <span className="text-sm font-medium text-foreground">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  onClick={() => handleBulkAction("approved")}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setRejectDialog({
                      open: true,
                      candidateIds: Array.from(selected),
                      bulk: true,
                    })
                  }
                  disabled={actionLoading}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Reject All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("on_hold")}
                  disabled={actionLoading}
                >
                  <PauseCircle className="mr-1 h-3.5 w-3.5" />
                  Hold All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Candidate Table */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !data?.candidates.length ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-foreground">No candidates found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search ? "Try adjusting your search" : "No candidates in this status"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="p-3 w-10">
                            <Checkbox
                              checked={allOnPageSelected}
                              onCheckedChange={toggleSelectAll}
                            />
                          </th>
                          <th className="p-3 text-left font-medium text-muted-foreground">Candidate</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">Title</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden lg:table-cell">LinkedIn</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Submitted</th>
                          <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Profile</th>
                          <th className="p-3 text-right font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.candidates.map((candidate) => (
                          <CandidateRow
                            key={candidate.id}
                            candidate={candidate}
                            isSelected={selected.has(candidate.id)}
                            onSelect={() => toggleSelect(candidate.id)}
                            onPreview={() => openPreview(candidate.id)}
                            onAction={(action) => {
                              if (action === "rejected") {
                                setRejectDialog({ open: true, candidateId: candidate.id });
                              } else {
                                handleAction(candidate.id, action);
                              }
                            }}
                            actionLoading={actionLoading}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Candidate Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages} ({data.total} total)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* RECRUITERS VIEW */}
        {/* ============================================ */}
        {approvalType === "recruiters" && (
          <>
            {/* Status Tabs */}
            <div className="flex flex-wrap gap-2">
              {RECRUITER_TABS.map((tab) => {
                const count = recruiterData?.counts[tab.countKey] ?? 0;
                const isActive = recruiterStatusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setRecruiterStatusFilter(tab.value)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {tab.label}
                    <Badge
                      variant={isActive ? "secondary" : "outline"}
                      className="ml-1 min-w-[24px] justify-center text-xs"
                    >
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or company..."
                    value={recruiterSearchInput}
                    onChange={(e) => setRecruiterSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Search
                </Button>
              </form>

              <div className="flex items-center gap-2">
                <Select value={recruiterSort} onValueChange={(v) => { setRecruiterSort(v); setRecruiterPage(1); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecruiterOrder(recruiterOrder === "asc" ? "desc" : "asc")}
                >
                  {recruiterOrder === "asc" ? "A→Z" : "Z→A"}
                </Button>
              </div>
            </div>

            {/* Recruiter Table */}
            <Card>
              <CardContent className="p-0">
                {recruiterLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !recruiterData?.recruiters.length ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-foreground">No recruiters found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {recruiterSearch ? "Try adjusting your search" : "No recruiters in this status"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">Email</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                          <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                          <th className="p-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                          <th className="p-3 text-right font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recruiterData.recruiters.map((recruiter) => (
                          <RecruiterRow
                            key={recruiter.id}
                            recruiter={recruiter}
                            onPreview={() => openRecruiterPreview(recruiter.id)}
                            onAction={(action) => {
                              if (action === "rejected") {
                                setRejectDialog({ open: true, recruiterId: recruiter.id });
                              } else {
                                handleRecruiterAction(recruiter.id, action);
                              }
                            }}
                            actionLoading={actionLoading}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recruiter Pagination */}
            {recruiterData && recruiterData.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {recruiterData.page} of {recruiterData.totalPages} ({recruiterData.total} total)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recruiterPage <= 1}
                    onClick={() => setRecruiterPage(recruiterPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recruiterPage >= recruiterData.totalPages}
                    onClick={() => setRecruiterPage(recruiterPage + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Candidate Preview Sheet */}
        <Sheet open={!!previewId} onOpenChange={(open) => !open && closePreview()}>
          <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center py-20">
                <SheetTitle className="sr-only">Candidate Preview</SheetTitle>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewData ? (
              <CandidatePreview
                candidate={previewData}
                onAction={(action) => {
                  if (action === "rejected") {
                    setRejectDialog({ open: true, candidateId: previewData.id });
                  } else {
                    handleAction(previewData.id, action);
                  }
                }}
                actionLoading={actionLoading}
              />
            ) : (
              <SheetTitle className="sr-only">Candidate Preview</SheetTitle>
            )}
          </SheetContent>
        </Sheet>

        {/* Recruiter Preview Sheet */}
        <Sheet open={!!recruiterPreviewId} onOpenChange={(open) => !open && closeRecruiterPreview()}>
          <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
            {recruiterPreviewLoading ? (
              <div className="flex items-center justify-center py-20">
                <SheetTitle className="sr-only">Recruiter Preview</SheetTitle>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recruiterPreviewData ? (
              <RecruiterPreview
                recruiter={recruiterPreviewData}
                onAction={(action) => {
                  if (action === "rejected") {
                    setRejectDialog({ open: true, recruiterId: recruiterPreviewData.id });
                  } else {
                    handleRecruiterAction(recruiterPreviewData.id, action);
                  }
                }}
                actionLoading={actionLoading}
              />
            ) : (
              <SheetTitle className="sr-only">Recruiter Preview</SheetTitle>
            )}
          </SheetContent>
        </Sheet>

        {/* Reject Dialog (shared) */}
        <Dialog
          open={rejectDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setRejectDialog({ open: false });
              setRejectReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Reject {rejectDialog.recruiterId ? "Recruiter" : `Candidate${rejectDialog.bulk ? "s" : ""}`}
              </DialogTitle>
              <DialogDescription>
                Please provide a reason for rejection.{" "}
                {rejectDialog.recruiterId
                  ? "This will be recorded for audit purposes."
                  : "This will be shared with the candidate via email so they can update their profile."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea
                id="reject-reason"
                placeholder={
                  rejectDialog.recruiterId
                    ? "e.g. Incomplete company profile, unverified identity..."
                    : "e.g. Incomplete work experience, missing LinkedIn profile details..."
                }
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setRejectDialog({ open: false });
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || actionLoading}
                onClick={handleRejectConfirm}
              >
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}

// ============================================
// Candidate Row Component
// ============================================

function CandidateRow({
  candidate,
  isSelected,
  onSelect,
  onPreview,
  onAction,
  actionLoading,
}: {
  candidate: ApprovalCandidate;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onAction: (action: ApprovalActionType) => void;
  actionLoading: boolean;
}) {
  const submitted = candidate.createdAt
    ? new Date(candidate.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

  return (
    <tr
      className="border-b border-border transition-colors hover:bg-muted/30 cursor-pointer"
      onClick={onPreview}
    >
      <td className="p-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {candidate.fullName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{candidate.fullName}</p>
            <p className="text-xs text-muted-foreground truncate">{candidate.email}</p>
          </div>
        </div>
      </td>
      <td className="p-3 hidden md:table-cell">
        <span className="text-foreground">{candidate.currentTitle || "—"}</span>
      </td>
      <td className="p-3 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
        {candidate.linkedinUrl ? (
          <a
            href={candidate.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
          >
            LinkedIn <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="p-3 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground">{submitted}</span>
      </td>
      <td className="p-3">
        <ApprovalStatusBadge status={candidate.onboardingStatus} />
      </td>
      <td className="p-3 hidden lg:table-cell">
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>{candidate._count.candidateSkills} skills</span>
          <span>&middot;</span>
          <span>{candidate._count.candidateExperiences} exp</span>
        </div>
      </td>
      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {candidate.onboardingStatus !== "APPROVED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
              onClick={() => onAction("approved")}
              disabled={actionLoading}
              title="Approve"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          {candidate.onboardingStatus !== "REJECTED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => onAction("rejected")}
              disabled={actionLoading}
              title="Reject"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          {candidate.onboardingStatus !== "ON_HOLD" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              onClick={() => onAction("on_hold")}
              disabled={actionLoading}
              title="Put on hold"
            >
              <PauseCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================
// Recruiter Row Component
// ============================================

function RecruiterRow({
  recruiter,
  onPreview,
  onAction,
  actionLoading,
}: {
  recruiter: ApprovalRecruiter;
  onPreview: () => void;
  onAction: (action: ApprovalActionType) => void;
  actionLoading: boolean;
}) {
  const submitted = recruiter.createdAt
    ? new Date(recruiter.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

  return (
    <tr
      className="border-b border-border transition-colors hover:bg-muted/30 cursor-pointer"
      onClick={onPreview}
    >
      <td className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {recruiter.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{recruiter.name}</p>
            {recruiter.title && (
              <p className="text-xs text-muted-foreground truncate">{recruiter.title}</p>
            )}
          </div>
        </div>
      </td>
      <td className="p-3 hidden md:table-cell">
        <span className="text-foreground text-sm truncate">{recruiter.email}</span>
      </td>
      <td className="p-3 hidden lg:table-cell">
        <span className="text-foreground text-sm">{recruiter.company?.name || "—"}</span>
      </td>
      <td className="p-3">
        <ApprovalStatusBadge status={recruiter.onboardingStatus} />
      </td>
      <td className="p-3 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground">{submitted}</span>
      </td>
      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {recruiter.onboardingStatus !== "APPROVED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
              onClick={() => onAction("approved")}
              disabled={actionLoading}
              title="Approve"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          {recruiter.onboardingStatus !== "REJECTED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => onAction("rejected")}
              disabled={actionLoading}
              title="Reject"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================
// Candidate Preview (Sheet Content)
// ============================================

function CandidatePreview({
  candidate,
  onAction,
  actionLoading,
}: {
  candidate: ApprovalCandidateDetail;
  onAction: (action: ApprovalActionType) => void;
  actionLoading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {candidate.fullName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg">{candidate.fullName}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              {candidate.email}
              <ApprovalStatusBadge status={candidate.onboardingStatus} />
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {/* Personal Info */}
        <PreviewSection icon={User} title="Personal Information">
          <div className="grid gap-2">
            {candidate.currentTitle && (
              <InfoItem icon={Briefcase} value={candidate.currentTitle} />
            )}
            {candidate.location && (
              <InfoItem icon={MapPin} value={candidate.location} />
            )}
            {candidate.phone && <InfoItem icon={Phone} value={candidate.phone} />}
            {candidate.email && <InfoItem icon={Mail} value={candidate.email} />}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn Profile
              </a>
            )}
            {candidate.invitationSource && (
              <p className="text-xs text-muted-foreground">
                Source: {candidate.invitationSource === "recruiter_invited" ? "Recruiter Invited" : "Self Signup"}
              </p>
            )}
          </div>
        </PreviewSection>

        {/* Resume */}
        {candidate.documents?.length > 0 && (
          <PreviewSection icon={FileText} title="Documents">
            <div className="space-y-2">
              {candidate.documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 hover:bg-muted/60 transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground truncate flex-1">
                    {doc.filename}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {doc.type}
                  </Badge>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </PreviewSection>
        )}

        {/* Experience */}
        {candidate.experiences?.length > 0 && (
          <PreviewSection icon={Briefcase} title={`Experience (${candidate.experiences.length})`}>
            <div className="space-y-3">
              {candidate.experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="rounded-md border border-border bg-muted/30 p-3"
                >
                  <p className="font-medium text-foreground text-sm">{exp.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exp.company}
                    {exp.location && ` \u00b7 ${exp.location}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {exp.startDate
                      ? new Date(exp.startDate).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : "N/A"}{" "}
                    \u2013{" "}
                    {exp.isCurrent
                      ? "Present"
                      : exp.endDate
                        ? new Date(exp.endDate).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })
                        : "N/A"}
                  </p>
                  {exp.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </PreviewSection>
        )}

        {/* Skills */}
        {candidate.skills?.length > 0 && (
          <PreviewSection icon={Wrench} title={`Skills (${candidate.skills.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map((skill) => (
                <Badge key={skill.id} variant="secondary" className="text-xs">
                  {skill.skillName}
                </Badge>
              ))}
            </div>
          </PreviewSection>
        )}

        {/* Education */}
        {candidate.education?.length > 0 && (
          <PreviewSection icon={GraduationCap} title={`Education (${candidate.education.length})`}>
            <div className="space-y-2">
              {candidate.education.map((edu) => (
                <div key={edu.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="font-medium text-foreground text-sm">
                    {edu.degree}{edu.field && ` in ${edu.field}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{edu.institution}</p>
                </div>
              ))}
            </div>
          </PreviewSection>
        )}

        {/* Certifications */}
        {candidate.certifications?.length > 0 && (
          <PreviewSection icon={GraduationCap} title="Certifications">
            <div className="space-y-2">
              {candidate.certifications.map((cert) => (
                <div key={cert.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="font-medium text-foreground text-sm">{cert.name}</p>
                  <p className="text-xs text-muted-foreground">{cert.issuingOrg}</p>
                </div>
              ))}
            </div>
          </PreviewSection>
        )}

        {/* Preferences */}
        {candidate.jobPreferences && (
          <PreviewSection icon={Settings2} title="Job Preferences">
            <div className="grid gap-1.5 text-sm">
              {candidate.jobPreferences.preferredLocations?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-muted-foreground">Locations:</span>
                  {candidate.jobPreferences.preferredLocations.map((l) => (
                    <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>
                  ))}
                </div>
              )}
              {candidate.jobPreferences.remotePreference && (
                <p>
                  <span className="text-muted-foreground">Remote:</span>{" "}
                  <span className="text-foreground capitalize">
                    {candidate.jobPreferences.remotePreference.toLowerCase()}
                  </span>
                </p>
              )}
              {candidate.jobPreferences.availability && (
                <p>
                  <span className="text-muted-foreground">Availability:</span>{" "}
                  <span className="text-foreground">
                    {candidate.jobPreferences.availability.replace(/_/g, " ")}
                  </span>
                </p>
              )}
              {(candidate.jobPreferences.salaryMin || candidate.jobPreferences.salaryMax) && (
                <p>
                  <span className="text-muted-foreground">Salary:</span>{" "}
                  <span className="text-foreground">
                    {candidate.jobPreferences.salaryCurrency || "USD"}{" "}
                    {candidate.jobPreferences.salaryMin?.toLocaleString() || "?"} \u2013{" "}
                    {candidate.jobPreferences.salaryMax?.toLocaleString() || "?"}
                  </span>
                </p>
              )}
            </div>
          </PreviewSection>
        )}

        {/* Approval History */}
        {candidate.approvalHistory?.length > 0 && (
          <PreviewSection icon={Clock} title="Approval History">
            <div className="space-y-3">
              {candidate.approvalHistory.map((ah) => (
                <div
                  key={ah.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="mt-0.5">
                    {ah.action === "approved" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {ah.action === "rejected" && (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    {ah.action === "on_hold" && (
                      <PauseCircle className="h-4 w-4 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground capitalize">
                      {ah.action.replace("_", " ")}
                      {ah.adminEmail && (
                        <span className="text-muted-foreground font-normal">
                          {" "}by {ah.adminEmail}
                        </span>
                      )}
                    </p>
                    {ah.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">{ah.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(ah.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </PreviewSection>
        )}
      </div>

      {/* Action Footer */}
      <div className="border-t border-border pt-4 mt-auto flex gap-2">
        {candidate.onboardingStatus !== "APPROVED" && (
          <Button
            onClick={() => onAction("approved")}
            disabled={actionLoading}
            className="bg-green-600 hover:bg-green-700 text-white flex-1"
          >
            {actionLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        )}
        {candidate.onboardingStatus !== "REJECTED" && (
          <Button
            variant="destructive"
            onClick={() => onAction("rejected")}
            disabled={actionLoading}
            className="flex-1"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
        )}
        {candidate.onboardingStatus !== "ON_HOLD" && (
          <Button
            variant="outline"
            onClick={() => onAction("on_hold")}
            disabled={actionLoading}
            className="flex-1"
          >
            <PauseCircle className="mr-2 h-4 w-4" />
            Hold
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Recruiter Preview (Sheet Content)
// ============================================

function RecruiterPreview({
  recruiter,
  onAction,
  actionLoading,
}: {
  recruiter: ApprovalRecruiterDetail;
  onAction: (action: ApprovalActionType) => void;
  actionLoading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {recruiter.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg">{recruiter.name}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              {recruiter.email}
              <ApprovalStatusBadge status={recruiter.onboardingStatus} />
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {/* Personal Info */}
        <PreviewSection icon={User} title="Personal Information">
          <div className="grid gap-2">
            {recruiter.title && (
              <InfoItem icon={Briefcase} value={recruiter.title} />
            )}
            {recruiter.department && (
              <InfoItem icon={Building2} value={recruiter.department} />
            )}
            {recruiter.phone && <InfoItem icon={Phone} value={recruiter.phone} />}
            <InfoItem icon={Mail} value={recruiter.email} />
            {recruiter.linkedinUrl && (
              <a
                href={recruiter.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn Profile
              </a>
            )}
            {recruiter.bio && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground font-medium mb-1">Bio</p>
                <p className="text-sm text-foreground">{recruiter.bio}</p>
              </div>
            )}
          </div>
        </PreviewSection>

        {/* Company Details */}
        {recruiter.company && (
          <PreviewSection icon={Building2} title="Company Details">
            <div className="grid gap-2">
              <InfoItem icon={Building2} value={recruiter.company.name} />
              {recruiter.company.industry && (
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Industry:</span>
                  <span className="text-foreground">{recruiter.company.industry}</span>
                </div>
              )}
              {recruiter.company.companySize && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Size:</span>
                  <span className="text-foreground">{recruiter.company.companySize}</span>
                </div>
              )}
              {recruiter.company.website && (
                <a
                  href={recruiter.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {recruiter.company.website}
                </a>
              )}
              {recruiter.company.description && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                  <p className="text-sm text-foreground">{recruiter.company.description}</p>
                </div>
              )}
            </div>
          </PreviewSection>
        )}

        {/* Hiring Preferences */}
        {recruiter.hiringPreferences && Object.keys(recruiter.hiringPreferences).length > 0 && (
          <PreviewSection icon={Settings2} title="Hiring Preferences">
            <div className="grid gap-1.5 text-sm">
              {Object.entries(recruiter.hiringPreferences).map(([key, value]) => {
                if (value === null || value === undefined) return null;
                const displayKey = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
                return (
                  <div key={key} className="flex flex-wrap items-start gap-1">
                    <span className="text-muted-foreground">{displayKey}:</span>
                    <span className="text-foreground">
                      {Array.isArray(value) ? (
                        <span className="flex flex-wrap gap-1">
                          {value.map((v: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{String(v)}</Badge>
                          ))}
                        </span>
                      ) : (
                        String(value)
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </PreviewSection>
        )}

        {/* Onboarding Info */}
        <PreviewSection icon={Clock} title="Onboarding Status">
          <div className="grid gap-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">Step:</span>{" "}
              <span className="text-foreground">{recruiter.onboardingStep}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Completed:</span>{" "}
              <span className="text-foreground">{recruiter.onboardingCompleted ? "Yes" : "No"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Joined:</span>{" "}
              <span className="text-foreground">
                {new Date(recruiter.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </p>
          </div>
        </PreviewSection>
      </div>

      {/* Action Footer */}
      <div className="border-t border-border pt-4 mt-auto flex gap-2">
        {recruiter.onboardingStatus !== "APPROVED" && (
          <Button
            onClick={() => onAction("approved")}
            disabled={actionLoading}
            className="bg-green-600 hover:bg-green-700 text-white flex-1"
          >
            {actionLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        )}
        {recruiter.onboardingStatus !== "REJECTED" && (
          <Button
            variant="destructive"
            onClick={() => onAction("rejected")}
            disabled={actionLoading}
            className="flex-1"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function PreviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  );
}

function InfoItem({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-foreground">{value}</span>
    </div>
  );
}

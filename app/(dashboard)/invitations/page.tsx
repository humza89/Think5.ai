"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  RotateCcw,
  XCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Invitation {
  id: string;
  email?: string;
  status: string;
  sentAt?: string;
  expiresAt: string;
  createdAt: string;
  candidate?: {
    fullName: string;
    email?: string;
  };
  job?: {
    title: string;
    company?: {
      name: string;
    };
  };
}

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  expired: number;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }> = {
  PENDING: { label: "Pending", variant: "secondary", icon: Clock },
  SENT: { label: "Sent", variant: "secondary", icon: Send },
  OPENED: { label: "Opened", variant: "secondary", icon: Mail },
  ACCEPTED: { label: "Accepted", variant: "default", icon: CheckCircle },
  COMPLETED: { label: "Completed", variant: "default", icon: CheckCircle },
  EXPIRED: { label: "Expired", variant: "destructive", icon: AlertCircle },
  DECLINED: { label: "Revoked", variant: "outline", icon: XCircle },
};

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, accepted: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, [page, statusFilter]);

  async function fetchInvitations() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/invitations?${params}`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.data || []);
        setStats(data.stats || { total: 0, pending: 0, accepted: 0, expired: 0 });
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching invitations:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: "resend" | "revoke") {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/invitations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        toast.success(action === "resend" ? "Invitation resent" : "Invitation revoked");
        fetchInvitations();
      } else {
        const data = await response.json();
        toast.error(data.error || `Failed to ${action} invitation`);
      }
    } catch {
      toast.error(`Failed to ${action} invitation`);
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isExpired(expiresAt: string) {
    return new Date(expiresAt) < new Date();
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and manage all candidate interview invitations
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Sent</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Accepted</p>
            <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Expired</p>
            <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Filter */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Button
          variant={statusFilter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => { setStatusFilter(""); setPage(1); }}
        >
          All
        </Button>
        {["SENT", "PENDING", "ACCEPTED", "EXPIRED", "DECLINED"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {STATUS_CONFIG[s]?.label || s}
          </Button>
        ))}
      </div>

      {/* Invitations Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading invitations...
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-2">No invitations found</p>
          <p className="text-sm text-muted-foreground">
            Source candidates and send invitations from the Source page
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-left text-sm">
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const config = STATUS_CONFIG[invitation.status] || STATUS_CONFIG.PENDING;
                  const StatusIcon = config.icon;
                  const candidateName =
                    invitation.candidate?.fullName ||
                    invitation.email ||
                    "Unknown";
                  const candidateEmail =
                    invitation.candidate?.email || invitation.email;
                  const expired = isExpired(invitation.expiresAt);
                  const canResend =
                    ["PENDING", "SENT", "EXPIRED"].includes(invitation.status) || expired;
                  const canRevoke =
                    ["PENDING", "SENT", "OPENED"].includes(invitation.status) && !expired;

                  return (
                    <tr
                      key={invitation.id}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{candidateName}</p>
                        {candidateEmail && (
                          <p className="text-xs text-muted-foreground">
                            {candidateEmail}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {invitation.job ? (
                          <div>
                            <p className="text-sm">{invitation.job.title}</p>
                            {invitation.job.company && (
                              <p className="text-xs text-muted-foreground">
                                {invitation.job.company.name}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">
                            No job specified
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={config.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {expired && invitation.status !== "EXPIRED"
                            ? "Expired"
                            : config.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {invitation.sentAt
                          ? formatDate(invitation.sentAt)
                          : formatDate(invitation.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(invitation.expiresAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canResend && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoading === invitation.id}
                              onClick={() =>
                                handleAction(invitation.id, "resend")
                              }
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Resend
                            </Button>
                          )}
                          {canRevoke && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={actionLoading === invitation.id}
                              onClick={() =>
                                handleAction(invitation.id, "revoke")
                              }
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

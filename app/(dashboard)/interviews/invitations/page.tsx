"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Send,
  Clock,
  CheckCircle,
  Eye,
  XCircle,
  Loader2,
  Mail,
  User,
} from "lucide-react";

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "Pending", className: "bg-gray-100 text-gray-700", icon: Clock },
  SENT: { label: "Sent", className: "bg-blue-100 text-blue-700", icon: Send },
  OPENED: { label: "Opened", className: "bg-purple-100 text-purple-700", icon: Eye },
  ACCEPTED: { label: "Accepted", className: "bg-green-100 text-green-700", icon: CheckCircle },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  EXPIRED: { label: "Expired", className: "bg-orange-100 text-orange-700", icon: Clock },
  DECLINED: { label: "Declined", className: "bg-red-100 text-red-700", icon: XCircle },
};

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchInvitations();
  }, []);

  async function fetchInvitations(status?: string) {
    setLoading(true);
    try {
      const url = status
        ? `/api/interviews/invitations?status=${status}`
        : "/api/interviews/invitations";
      const res = await fetch(url);
      const data = await res.json();
      setInvitations(Array.isArray(data) ? data : []);
    } catch {
      setInvitations([]);
    }
    setLoading(false);
  }

  function handleFilter(status: string) {
    setFilter(status);
    fetchInvitations(status || undefined);
  }

  const filterTabs = [
    { value: "", label: "All" },
    { value: "SENT", label: "Sent" },
    { value: "OPENED", label: "Opened" },
    { value: "ACCEPTED", label: "Accepted" },
    { value: "COMPLETED", label: "Completed" },
    { value: "EXPIRED", label: "Expired" },
  ];

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Interview Invitations</h1>
              <p className="text-sm text-gray-500 mt-1">
                Track sent invitations and their status
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleFilter(tab.value)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  filter === tab.value
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : invitations.length === 0 ? (
            <Card className="p-12 text-center">
              <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invitations</h3>
              <p className="text-gray-500">
                Invitations you send will appear here for tracking
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv: any) => {
                const status = statusConfig[inv.status] || statusConfig.PENDING;
                const StatusIcon = status.icon;
                return (
                  <Card key={inv.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {inv.candidate?.fullName || inv.email || "Unknown"}
                          </p>
                          <p className="text-sm text-gray-500">
                            {inv.job?.title ? `${inv.job.title} at ${inv.job.company?.name}` : "No job specified"}
                            {inv.template && ` • ${inv.template.name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={status.className}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {inv.sentAt
                            ? `Sent ${new Date(inv.sentAt).toLocaleDateString()}`
                            : new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                        {inv.interview && (
                          <Link href={`/interviews/${inv.interview.id}/report`}>
                            <Button variant="outline" size="sm">
                              View Report
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
    </ProtectedRoute>
  );
}

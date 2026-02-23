"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Users,
  Briefcase,
  MessageSquare,
  FileText,
  Shield,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  UserCog,
  ScrollText,
} from "lucide-react";
import Link from "next/link";

// ============================================
// Types
// ============================================

interface AdminStats {
  totalUsers: number;
  totalJobs: number;
  totalCandidates: number;
  totalInterviews: number;
  totalApplications: number;
  usersByRole: {
    admin: number;
    recruiter: number;
    candidate: number;
    hiring_manager: number;
  };
}

interface ProfileUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  email_verified: boolean;
  created_at: string;
  updated_at?: string;
}

const ROLES = ["admin", "recruiter", "candidate", "hiring_manager"] as const;

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  recruiter: "bg-blue-100 text-blue-700",
  candidate: "bg-green-100 text-green-700",
  hiring_manager: "bg-purple-100 text-purple-700",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
  hiring_manager: "Hiring Manager",
};

// ============================================
// Overview Tab
// ============================================

function OverviewTab({
  stats,
  recentProfiles,
  loading,
}: {
  stats: AdminStats;
  recentProfiles: ProfileUser[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers || 0}</p>
              </div>
              <Users className="h-6 w-6 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Jobs</p>
                <p className="text-2xl font-bold">{stats.totalJobs || 0}</p>
              </div>
              <Briefcase className="h-6 w-6 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Candidates</p>
                <p className="text-2xl font-bold">{stats.totalCandidates || 0}</p>
              </div>
              <Users className="h-6 w-6 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Interviews</p>
                <p className="text-2xl font-bold">{stats.totalInterviews || 0}</p>
              </div>
              <MessageSquare className="h-6 w-6 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Applications</p>
                <p className="text-2xl font-bold">{stats.totalApplications || 0}</p>
              </div>
              <FileText className="h-6 w-6 text-cyan-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users by Role */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users by Role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ROLES.map((role) => (
              <div
                key={role}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    role === "admin"
                      ? "bg-red-500"
                      : role === "recruiter"
                      ? "bg-blue-500"
                      : role === "candidate"
                      ? "bg-green-500"
                      : "bg-purple-500"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">{roleLabels[role]}</p>
                  <p className="text-lg font-bold">
                    {stats.usersByRole?.[role] ?? 0}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Database</p>
                <p className="text-xs text-green-600">Connected</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Auth Service</p>
                <p className="text-xs text-green-600">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">API</p>
                <p className="text-xs text-green-600">Healthy</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Sign-ups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Sign-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentProfiles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No recent sign-ups
            </p>
          ) : (
            <div className="space-y-3">
              {recentProfiles.slice(0, 10).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                      {(p.first_name || "?").charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-gray-400">{p.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        roleColors[p.role] || "bg-gray-100 text-gray-700"
                      }
                    >
                      {roleLabels[p.role] || p.role}
                    </Badge>
                    {p.email_verified ? (
                      <span className="text-xs text-green-600">Verified</span>
                    ) : (
                      <span className="text-xs text-red-500">Unverified</span>
                    )}
                    <span className="text-xs text-gray-300">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// User Management Tab
// ============================================

function UserManagementTab() {
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
      });
      if (search) params.set("search", search);
      if (roleFilter && roleFilter !== "all") params.set("role", roleFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch users");

      const data = await res.json();
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when search or role filter changes
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");

      const { user: updated } = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updated } : u))
      );
    } catch (err) {
      console.error("Error updating role:", err);
    } finally {
      setUpdating(null);
    }
  };

  const handleVerifyToggle = async (
    userId: string,
    currentVerified: boolean
  ) => {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_verified: !currentVerified }),
      });
      if (!res.ok) throw new Error("Failed to update verification");

      const { user: updated } = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updated } : u))
      );
    } catch (err) {
      console.error("Error updating verification:", err);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabels[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Users className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Name
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Email
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Role
                    </th>
                    <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">
                      Verified
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Joined
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium shrink-0">
                            {(user.first_name || "?").charAt(0)}
                          </div>
                          <span className="text-sm font-medium">
                            {user.first_name} {user.last_name}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {user.email}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            roleColors[user.role] ||
                            "bg-gray-100 text-gray-700"
                          }
                        >
                          {roleLabels[user.role] || user.role}
                        </Badge>
                      </td>

                      {/* Verified */}
                      <td className="px-4 py-3 text-center">
                        {user.email_verified ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 inline-block" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400 inline-block" />
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {/* Role Selector */}
                          <Select
                            value={user.role}
                            onValueChange={(val) =>
                              handleRoleChange(user.id, val)
                            }
                            disabled={updating === user.id}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleLabels[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Verify Toggle */}
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={user.email_verified}
                              onCheckedChange={() =>
                                handleVerifyToggle(
                                  user.id,
                                  user.email_verified
                                )
                              }
                              disabled={updating === user.id}
                              className="data-[state=checked]:bg-green-500"
                            />
                            <span className="text-xs text-gray-400 w-14">
                              {user.email_verified ? "Verified" : "Unverified"}
                            </span>
                          </div>

                          {updating === user.id && (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, total)} of{" "}
            {total} users
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-gray-600 px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Audit Log Tab (Placeholder)
// ============================================

function AuditLogTab() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
        <ScrollText className="h-12 w-12 text-gray-300" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-700">
            Audit Log Coming Soon
          </h3>
          <p className="text-sm text-gray-400 mt-1 max-w-md">
            Track all administrative actions including role changes, user
            verifications, and system events. This feature is currently under
            development.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Admin Page
// ============================================

export default function AdminPage() {
  const [data, setData] = useState<{
    stats: AdminStats;
    recentProfiles: ProfileUser[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) {
        throw new Error(`Failed to load admin data (${res.status})`);
      }
      const d = await res.json();
      setData(d);
    } catch (err) {
      console.error("Error fetching admin data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load admin data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <ProtectedRoute allowedRoles={["admin"]}>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </ProtectedRoute>
    );
  }

  const stats: AdminStats = data?.stats || {
    totalUsers: 0,
    totalJobs: 0,
    totalCandidates: 0,
    totalInterviews: 0,
    totalApplications: 0,
    usersByRole: { admin: 0, recruiter: 0, candidate: 0, hiring_manager: 0 },
  };
  const recentProfiles = data?.recentProfiles || [];

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Admin Panel
            </h1>
            <p className="text-sm text-gray-500">
              Platform administration and user management
            </p>
          </div>
        </div>

        {/* Tabbed Layout */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <UserCog className="h-4 w-4" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <ScrollText className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              stats={stats}
              recentProfiles={recentProfiles}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="users">
            <UserManagementTab />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}

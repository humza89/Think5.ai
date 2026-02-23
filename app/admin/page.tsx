"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Users,
  Briefcase,
  MessageSquare,
  BarChart3,
  Shield,
  Loader2,
  FileText,
  Settings,
} from "lucide-react";
import Link from "next/link";

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  recruiter: "bg-blue-100 text-blue-700",
  candidate: "bg-green-100 text-green-700",
  hiring_manager: "bg-purple-100 text-purple-700",
};

export default function AdminPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["admin"]}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </ProtectedRoute>
    );
  }

  const stats = data?.stats || {};
  const profiles = data?.recentProfiles || [];

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-8">
            <Shield className="h-6 w-6 text-red-600" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-500">Platform administration and user management</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Recruiters</p>
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

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link href="/analytics">
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <span className="font-medium">Analytics Dashboard</span>
                </div>
              </Card>
            </Link>
            <Link href="/settings">
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-gray-600" />
                  <span className="font-medium">Platform Settings</span>
                </div>
              </Card>
            </Link>
            <Link href="/interviews/templates">
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Interview Templates</span>
                </div>
              </Card>
            </Link>
          </div>

          {/* User List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Users</CardTitle>
            </CardHeader>
            <CardContent>
              {profiles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No users found</p>
              ) : (
                <div className="space-y-3">
                  {profiles.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
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
                        <Badge className={roleColors[p.role] || "bg-gray-100 text-gray-700"}>
                          {p.role}
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
      </div>
    </ProtectedRoute>
  );
}

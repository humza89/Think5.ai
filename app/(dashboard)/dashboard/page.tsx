import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import {
  Users,
  Briefcase,
  Building2,
  TrendingUp,
  MessageSquare,
  Send,
  Plus,
  Search,
  FileText,
  ArrowRight,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

async function getDashboardStats() {
  try {
    const [
      totalCandidates,
      totalClients,
      activeJobs,
      totalMatches,
      totalInterviews,
      pendingInvitations,
      recentCandidates,
      topMatches,
      recentInterviews,
      recentApplications,
    ] = await Promise.all([
      prisma.candidate.count(),
      prisma.client.count(),
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.match.count({ where: { fitScore: { gte: 70 } } }),
      prisma.interview.count(),
      prisma.interviewInvitation.count({ where: { status: "SENT" } }),
      prisma.candidate.findMany({
        select: { id: true, fullName: true, currentTitle: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.match.findMany({
        where: { fitScore: { gte: 70 } },
        include: {
          candidate: { select: { fullName: true } },
          role: { select: { title: true } },
        },
        orderBy: { fitScore: "desc" },
        take: 5,
      }),
      prisma.interview.findMany({
        include: {
          candidate: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.application.findMany({
        include: {
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
        orderBy: { appliedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      totalCandidates,
      totalClients,
      activeJobs,
      totalMatches,
      totalInterviews,
      pendingInvitations,
      recentCandidates: JSON.parse(JSON.stringify(recentCandidates)),
      topMatches: JSON.parse(JSON.stringify(topMatches)),
      recentInterviews: JSON.parse(JSON.stringify(recentInterviews)),
      recentApplications: JSON.parse(JSON.stringify(recentApplications)),
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return {
      hasError: true,
      totalCandidates: 0,
      totalClients: 0,
      activeJobs: 0,
      totalMatches: 0,
      totalInterviews: 0,
      pendingInvitations: 0,
      recentCandidates: [],
      topMatches: [],
      recentInterviews: [],
      recentApplications: [],
    };
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex gap-2">
            <Link href="/jobs/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Post Job
              </Button>
            </Link>
            <Link href="/candidates">
              <Button size="sm" variant="outline">
                <Search className="h-4 w-4 mr-1" />
                Search Candidates
              </Button>
            </Link>
          </div>
        </div>

        {stats.hasError && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Unable to load dashboard data
              </p>
              <p className="text-xs text-red-600">
                Some statistics may be unavailable. Please try refreshing the page.
              </p>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active Jobs</CardTitle>
              <Briefcase className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeJobs}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Candidates</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCandidates}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Interviews</CardTitle>
              <MessageSquare className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalInterviews}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Quality Matches</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMatches}</div>
              <p className="text-xs text-muted-foreground/60">&gt;70% score</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Clients</CardTitle>
              <Building2 className="h-4 w-4 text-cyan-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pending Invites</CardTitle>
              <Send className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingInvitations}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Link href="/jobs/new">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Post Job</p>
                  <p className="text-xs text-muted-foreground/60">Create new posting</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/interviews/templates">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Templates</p>
                  <p className="text-xs text-muted-foreground/60">Interview configs</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/interviews/invitations">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Send className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Invitations</p>
                  <p className="text-xs text-muted-foreground/60">Track invites</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/interviews">
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Review</p>
                  <p className="text-xs text-muted-foreground/60">Interview results</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Candidates */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Candidates</CardTitle>
              <Link href="/candidates" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {stats.recentCandidates.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentCandidates.map((c: any) => (
                    <Link key={c.id} href={`/candidates/${c.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {c.fullName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground/60">{c.currentTitle || "No title"}</p>
                      </div>
                      <span className="text-xs text-muted-foreground/40">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 text-center py-6">No candidates yet</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Applications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Applications</CardTitle>
              <Link href="/jobs" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {stats.recentApplications.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentApplications.map((app: any) => (
                    <div key={app.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                        {app.candidate.fullName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{app.candidate.fullName}</p>
                        <p className="text-xs text-muted-foreground/60 truncate">{app.job.title}</p>
                      </div>
                      <span className="text-xs text-muted-foreground/40">
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 text-center py-6">No applications yet</p>
              )}
            </CardContent>
          </Card>

          {/* Top Matches */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Top Matches</CardTitle>
              <Link href="/candidates" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {stats.topMatches.length > 0 ? (
                <div className="space-y-3">
                  {stats.topMatches.map((match: any) => (
                    <div key={match.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-600">
                        {Math.round(match.fitScore)}%
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{match.candidate?.fullName}</p>
                        <p className="text-xs text-muted-foreground/60 truncate">{match.role?.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 text-center py-6">No matches yet</p>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, Building2, TrendingUp } from "lucide-react";

async function getDashboardStats() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    const [candidates, clients, roles, matches] = await Promise.all([
      fetch(`${baseUrl}/api/candidates`, { cache: "no-store" }).then((res) =>
        res.json()
      ),
      fetch(`${baseUrl}/api/clients`, { cache: "no-store" }).then((res) =>
        res.json()
      ),
      fetch(`${baseUrl}/api/roles`, { cache: "no-store" }).then((res) =>
        res.json()
      ),
      fetch(`${baseUrl}/api/matches?minScore=70`, { cache: "no-store" }).then(
        (res) => res.json()
      ),
    ]);

    return {
      totalCandidates: Array.isArray(candidates) ? candidates.length : 0,
      totalClients: Array.isArray(clients) ? clients.length : 0,
      totalRoles: Array.isArray(roles) ? roles.length : 0,
      totalMatches: Array.isArray(matches) ? matches.length : 0,
      recentCandidates: Array.isArray(candidates) ? candidates.slice(0, 5) : [],
      topMatches: Array.isArray(matches) ? matches.slice(0, 5) : [],
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return {
      totalCandidates: 0,
      totalClients: 0,
      totalRoles: 0,
      totalMatches: 0,
      recentCandidates: [],
      topMatches: [],
    };
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-2xl font-bold">
                Paraform
              </Link>
              <nav className="flex space-x-6">
                <Link
                  href="/dashboard"
                  className="text-blue-600 font-medium border-b-2 border-blue-600 pb-4"
                >
                  Dashboard
                </Link>
                <Link
                  href="/candidates"
                  className="text-gray-600 hover:text-gray-900 pb-4"
                >
                  Candidates
                </Link>
                <Link
                  href="/clients"
                  className="text-gray-600 hover:text-gray-900 pb-4"
                >
                  Clients
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Candidates
              </CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalCandidates}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Clients
              </CardTitle>
              <Building2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalClients}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Active Roles
              </CardTitle>
              <Briefcase className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalRoles}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Quality Matches
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalMatches}</div>
              <p className="text-xs text-gray-500 mt-1">&gt;70% fit score</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Candidates */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Candidates</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentCandidates.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentCandidates.map((candidate: any) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{candidate.fullName}</p>
                        <p className="text-sm text-gray-600">
                          {candidate.currentTitle || "No title"}
                        </p>
                      </div>
                      <Link
                        href={`/candidates?id=${candidate.id}`}
                        className="text-blue-600 text-sm hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No candidates yet</p>
                  <Link
                    href="/candidates"
                    className="text-blue-600 hover:underline text-sm mt-2 inline-block"
                  >
                    Add your first candidate
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Matches */}
          <Card>
            <CardHeader>
              <CardTitle>Top Matches</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topMatches.length > 0 ? (
                <div className="space-y-4">
                  {stats.topMatches.map((match: any) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {match.candidate?.fullName}
                        </p>
                        <p className="text-sm text-gray-600">
                          {match.role?.title}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">
                          {Math.round(match.fitScore)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No matches yet</p>
                  <p className="text-sm mt-2">
                    Add candidates and roles to see matches
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

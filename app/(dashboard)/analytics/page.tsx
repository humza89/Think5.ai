"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import {
  Briefcase,
  Users,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsData {
  overview: {
    totalJobs: number;
    activeJobs: number;
    totalApplications: number;
    totalInterviews: number;
    completedInterviews: number;
    totalCandidates: number;
    totalMatches: number;
    recentHires: number;
    interviewCompletion: number;
    avgTimeToHire: number;
  };
  trends: {
    applications: number;
    activeJobs: number;
    interviewCompletion: number;
    hires: number;
  };
  funnel: { stage: string; count: number }[];
  applicationsOverTime: { period: string; count: number }[];
  scoreDistribution: { range: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
];

const DATE_RANGES: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TrendIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendingUp className="h-3 w-3" />
        +{value}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-500">
        <TrendingDown className="h-3 w-3" />
        {value}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Date range */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-9 w-16 rounded-md" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 pb-4">
              <Skeleton className="h-4 w-28 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[280px] w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);

  const fetchData = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load analytics (${res.status})`);
      }
      const d: AnalyticsData = await res.json();
      setData(d);
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load analytics data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(rangeDays);
  }, [fetchData, rangeDays]);

  // ----- Loading state -----
  if (loading) {
    return <AnalyticsSkeleton />;
  }

  // ----- Error state -----
  if (error) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="rounded-full bg-red-50 p-4">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Unable to load analytics
          </h2>
          <p className="text-sm text-gray-500 max-w-md text-center">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(rangeDays)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const overview = data?.overview ?? {
    totalApplications: 0,
    activeJobs: 0,
    interviewCompletion: 0,
    avgTimeToHire: 0,
    recentHires: 0,
    totalJobs: 0,
    totalInterviews: 0,
    completedInterviews: 0,
    totalCandidates: 0,
    totalMatches: 0,
  };
  const trends = data?.trends ?? {
    applications: 0,
    activeJobs: 0,
    interviewCompletion: 0,
    hires: 0,
  };
  const funnel = data?.funnel ?? [];
  const applicationsOverTime = data?.applicationsOverTime ?? [];
  const scoreDistribution = data?.scoreDistribution ?? [];

  // ----- KPI cards config -----
  const kpiCards = [
    {
      label: "Total Applications",
      value: overview.totalApplications,
      trend: trends.applications,
      icon: Users,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-50",
    },
    {
      label: "Active Jobs",
      value: overview.activeJobs,
      trend: trends.activeJobs,
      icon: Briefcase,
      iconColor: "text-purple-500",
      bgColor: "bg-purple-50",
    },
    {
      label: "Interview Completion",
      value: `${overview.interviewCompletion}%`,
      trend: trends.interviewCompletion,
      icon: CheckCircle,
      iconColor: "text-green-500",
      bgColor: "bg-green-50",
    },
    {
      label: "Avg Time-to-Hire",
      value: overview.avgTimeToHire > 0 ? `${overview.avgTimeToHire}d` : "--",
      trend: trends.hires,
      icon: Clock,
      iconColor: "text-amber-500",
      bgColor: "bg-amber-50",
    },
  ];

  // Custom tooltip for charts
  const ChartTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-white px-3 py-2 shadow-lg">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-gray-900">
          {payload[0].value}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your recruiting performance
          </p>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                rangeDays === r.days
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              Last {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* KPI Cards                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="relative overflow-hidden">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">
                    {kpi.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {kpi.value}
                  </p>
                  <TrendIndicator value={kpi.trend} />
                </div>
                <div className={`rounded-lg p-2.5 ${kpi.bgColor}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Charts grid                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ------ Hiring Funnel (horizontal bar chart) ------ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Hiring Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.every((f) => f.count === 0) ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-gray-400">No funnel data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={funnel}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis type="number" fontSize={12} stroke="#94a3b8" />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    width={80}
                    fontSize={12}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={28}>
                    {funnel.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ------ Applications Over Time (area chart with gradient) ------ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Applications Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {applicationsOverTime.length === 0 ||
            applicationsOverTime.every((d) => d.count === 0) ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-gray-400">
                  No application data yet
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={applicationsOverTime}
                  margin={{ top: 4, right: 12, bottom: 4, left: -10 }}
                >
                  <defs>
                    <linearGradient
                      id="areaGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={CHART_COLORS[0]}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={CHART_COLORS[0]}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="period"
                    fontSize={11}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    fontSize={12}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    fill="url(#areaGradient)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: CHART_COLORS[0],
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ------ Interview Scores Distribution ------ */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Interview Scores Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scoreDistribution.every((d) => d.count === 0) ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-gray-400">
                  No interview score data yet
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={scoreDistribution}
                  margin={{ top: 4, right: 24, bottom: 4, left: -10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="range"
                    fontSize={12}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={12}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={48}>
                    {scoreDistribution.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

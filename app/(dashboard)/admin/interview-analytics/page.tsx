"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AnalyticsData {
  period: { days: number; since: string };
  volume: {
    total: number;
    completed: number;
    completionRate: number;
    byType: { type: string; count: number }[];
    byMode: { mode: string; count: number }[];
  };
  scoring: {
    totalReports: number;
    avgScore: number | null;
    scoreStdDev: number | null;
    recommendationDistribution: Record<string, number>;
    fairnessMetrics: {
      type: string;
      count: number;
      avgScore: number;
      minScore: number;
      maxScore: number;
    }[];
  };
  integrity: {
    avgScore: number | null;
    lowIntegrityCount: number;
    totalAssessed: number;
  };
  reportStatuses: { status: string | null; count: number }[];
  aiUsage: {
    totalCost: number;
    totalTokens: number;
    byModel: Record<string, { cost: number; tokens: number }>;
  } | null;
  quality: {
    totalAssessed: number;
    avgDepthScore: number | null;
    avgCoverage: number | null;
    avgResponseDepth: number | null;
    avgFollowUps: number | null;
    avgPersonalization: number | null;
  } | null;
}

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarCard({
  title,
  items,
  labelKey,
  valueKey,
  maxValue,
}: {
  title: string;
  items: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  maxValue: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-sm font-medium text-white mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">No data</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const label = String(item[labelKey] || "Unknown");
            const count = Number(item[valueKey] || 0);
            const pct = maxValue > 0 ? (count / maxValue) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">{label}</span>
                  <span className="text-zinc-300">{count}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminInterviewAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [days]);

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number | null | undefined, decimals = 1) =>
    n != null ? n.toFixed(decimals) : "--";

  const fmtCost = (n: number | null | undefined) =>
    n != null ? `$${n.toFixed(2)}` : "--";

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Interview Analytics</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Volume, scoring, integrity, and cost metrics
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
        <Link href="/admin/interview-templates" className="text-zinc-400 hover:text-white">Templates</Link>
        <Link href="/admin/interview-analytics" className="text-violet-400 font-medium">Analytics</Link>
        <Link href="/admin/shared-reports" className="text-zinc-400 hover:text-white">Shared Reports</Link>
        <Link href="/admin/hm-memberships" className="text-zinc-400 hover:text-white">HM Memberships</Link>
      </div>

      {/* Date Range */}
      <div className="flex gap-2 mb-6">
        {DATE_RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              days === r.days
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="mt-3 text-sm text-red-300 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Volume */}
          <section>
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-3">
              Volume
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Total Interviews" value={data.volume.total} />
              <MetricCard label="Completed" value={data.volume.completed} />
              <MetricCard
                label="Completion Rate"
                value={`${data.volume.completionRate}%`}
              />
              <MetricCard label="Reports Generated" value={data.scoring.totalReports} />
            </div>
          </section>

          {/* Volume by Type & Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BarCard
              title="By Type"
              items={data.volume.byType}
              labelKey="type"
              valueKey="count"
              maxValue={Math.max(...data.volume.byType.map((t) => t.count), 1)}
            />
            <BarCard
              title="By Mode"
              items={data.volume.byMode}
              labelKey="mode"
              valueKey="count"
              maxValue={Math.max(...data.volume.byMode.map((m) => m.count), 1)}
            />
          </div>

          {/* Scoring */}
          <section>
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-3">
              Scoring
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Average Score"
                value={fmt(data.scoring.avgScore)}
                sub="out of 100"
              />
              <MetricCard
                label="Std Deviation"
                value={fmt(data.scoring.scoreStdDev)}
              />
              <MetricCard
                label="Total Reports"
                value={data.scoring.totalReports}
              />
              <MetricCard
                label="Fairness Groups"
                value={data.scoring.fairnessMetrics.length}
              />
            </div>
          </section>

          {/* Recommendation Distribution */}
          <BarCard
            title="Recommendation Distribution"
            items={Object.entries(data.scoring.recommendationDistribution).map(
              ([label, count]) => ({ label, count })
            )}
            labelKey="label"
            valueKey="count"
            maxValue={Math.max(
              ...Object.values(data.scoring.recommendationDistribution),
              1
            )}
          />

          {/* Integrity */}
          <section>
            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-3">
              Integrity
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard
                label="Average Integrity Score"
                value={fmt(data.integrity.avgScore)}
              />
              <MetricCard
                label="Low Integrity Count"
                value={data.integrity.lowIntegrityCount}
                sub={`of ${data.integrity.totalAssessed} assessed`}
              />
              <MetricCard
                label="Total Assessed"
                value={data.integrity.totalAssessed}
              />
            </div>
          </section>

          {/* AI Usage */}
          {data.aiUsage && (
            <section>
              <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-3">
                AI Usage Costs
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard
                  label="Total Cost"
                  value={fmtCost(data.aiUsage.totalCost)}
                />
                <MetricCard
                  label="Total Tokens"
                  value={data.aiUsage.totalTokens.toLocaleString()}
                />
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs text-zinc-500 mb-2">Cost by Model</p>
                  {data.aiUsage.byModel &&
                    Object.entries(data.aiUsage.byModel).map(([model, stats]) => (
                      <div
                        key={model}
                        className="flex justify-between text-xs text-zinc-400 mb-1"
                      >
                        <span>{model}</span>
                        <span>{fmtCost(stats.cost)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          )}

          {/* Quality Metrics */}
          {data.quality && (
            <section>
              <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-3">
                Quality Metrics
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard
                  label="Assessed Interviews"
                  value={data.quality.totalAssessed}
                />
                <MetricCard
                  label="Avg Depth Score"
                  value={fmt(data.quality.avgDepthScore)}
                />
                <MetricCard
                  label="Avg Coverage"
                  value={`${fmt(data.quality.avgCoverage)}%`}
                />
                <MetricCard
                  label="Avg Response Depth"
                  value={fmt(data.quality.avgResponseDepth)}
                />
                <MetricCard
                  label="Avg Follow-ups"
                  value={fmt(data.quality.avgFollowUps)}
                />
                <MetricCard
                  label="Avg Personalization"
                  value={fmt(data.quality.avgPersonalization)}
                />
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

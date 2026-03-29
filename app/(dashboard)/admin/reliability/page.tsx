"use client";

import { useState, useEffect, useCallback } from "react";

interface SLOStatus {
  name: string;
  description: string;
  target: number;
  current: number;
  totalEvents: number;
  successEvents: number;
  errorBudgetRemaining: number;
  breached: boolean;
}

interface HealthCheck {
  status: string;
  timestamp: string;
  checks: Record<string, string>;
}

export default function ReliabilityPage() {
  const [slos, setSlos] = useState<SLOStatus[]>([]);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, sloRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/admin/reliability"),
      ]);
      if (healthRes.ok) setHealth(await healthRes.json());
      if (sloRes.ok) {
        const data = await sloRes.json();
        setSlos(data.slos || []);
      }
    } catch {
      console.error("Failed to fetch reliability data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const statusColor = (status: string) => {
    if (status === "healthy" || status === "configured") return "text-green-600 bg-green-50";
    if (status === "degraded") return "text-yellow-600 bg-yellow-50";
    if (status === "not_configured") return "text-gray-500 bg-gray-50";
    return "text-red-600 bg-red-50";
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading reliability data...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Reliability Dashboard</h1>
        <p className="text-sm text-gray-500">SLO monitoring, service health, and error budgets</p>
      </div>

      {/* Service Health */}
      {health && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Service Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(health.checks).map(([service, status]) => (
              <div key={service} className="rounded-lg border p-4">
                <div className="text-xs text-gray-500 uppercase mb-1">{service}</div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(status)}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SLO Table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Service Level Objectives</h2>
        {slos.length === 0 ? (
          <p className="text-gray-500 text-sm">No SLO data available yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Events</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {slos.map((slo) => (
                  <tr key={slo.name} className={slo.breached ? "bg-red-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{slo.name}</div>
                      <div className="text-xs text-gray-500">{slo.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {(slo.current * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">
                      {(slo.target * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {slo.successEvents}/{slo.totalEvents}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              slo.errorBudgetRemaining > 50 ? "bg-green-500" :
                              slo.errorBudgetRemaining > 20 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(100, slo.errorBudgetRemaining)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{slo.errorBudgetRemaining.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        slo.breached ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}>
                        {slo.breached ? "BREACHED" : "OK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

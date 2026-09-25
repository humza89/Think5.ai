"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface ActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userRole: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Phase 0 T10: the candidate's ActivityLog timeline (candidate, application and interview events). */
export default function ActivityTab() {
  const params = useParams();
  const id = params.id as string;
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/candidates/${id}/activity`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Could not load activity");
        return (await res.json()).events as ActivityEvent[];
      })
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load activity"));
  }, [id]);

  return (
    <div className="max-w-4xl">
      <div className="bg-white border rounded-lg shadow-sm" data-testid="candidate-activity">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Activity</h3>
          <p className="text-sm text-gray-600">Audit-logged events about this candidate, their applications and interviews.</p>
        </div>
        {error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : events === null ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No activity recorded yet.</p>
        ) : (
          <ol className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="px-6 py-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{e.action.replace(/[._]/g, " ")}</p>
                  <p className="text-xs text-gray-500">{e.entityType} · by {e.userRole}</p>
                </div>
                <time className="text-xs text-gray-500" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

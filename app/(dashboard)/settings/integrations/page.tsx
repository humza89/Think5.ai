"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plug, RefreshCw, Unlink, RotateCw, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Status {
  connected: boolean;
  provider: string;
  integrationId?: string;
  lastSyncAt?: string | null;
  syncStatus?: string | null;
  syncError?: string | null;
  webhookConfigured?: boolean;
  onBehalfOf?: string | null;
  webhookUrl?: string;
  runs?: Array<{ id: string; direction: string; trigger: string; status: string; startedAt: string; finishedAt: string | null; counts: Record<string, number> | null; errors: Array<{ message: string }> | null }>;
  links?: Record<string, number>;
}

interface LinkRow {
  id: string;
  localType: string;
  localId: string;
  remoteId: string;
  lastSyncedAt: string;
  remoteUpdatedAt: string | null;
  local: Record<string, unknown> | null;
  remoteState: unknown;
  mismatch: string | null;
}

/**
 * Phase 0 T15: Greenhouse two-way proof. Connect with a Harvest API key,
 * see sync status and runs, and reconcile links (retry / unlink).
 */
export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [onBehalfOf, setOnBehalfOf] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([apiFetch("/api/integrations/greenhouse/status", { cache: "no-store" }), apiFetch("/api/integrations/greenhouse/links", { cache: "no-store" })]);
      if (s.ok) setStatus(await s.json());
      else setStatus({ connected: false, provider: "greenhouse" });
      if (l.ok) setLinks((await l.json()).links ?? []);
    } catch {
      setStatus({ connected: false, provider: "greenhouse" });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function connect() {
    setBusy("connect");
    try {
      const res = await apiFetch("/api/integrations/greenhouse/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, webhookSecret: webhookSecret || undefined, onBehalfOf: onBehalfOf || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error || "Connection failed");
      toast.success("Greenhouse connected");
      setApiKey("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    }
    setBusy(null);
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const res = await apiFetch("/api/integrations/greenhouse/connect", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not disconnect");
      toast.success("Greenhouse disconnected");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    try {
      const res = await apiFetch("/api/integrations/greenhouse/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction: "import", inline: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const c = data.counts ?? {};
      toast.success(`Import ${data.status}: ${c.created ?? 0} created, ${c.updated ?? 0} updated, ${c.skipped ?? 0} unchanged${c.failed ? `, ${c.failed} failed` : ""}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
    setBusy(null);
  }

  async function linkAction(link: LinkRow, action: "retry" | "unlink") {
    setBusy(`${action}:${link.id}`);
    try {
      const res = await apiFetch("/api/integrations/greenhouse/links", { method: action === "retry" ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId: link.id, action }) });
      if (!res.ok) throw new Error((await res.json()).error || `Could not ${action}`);
      toast.success(action === "retry" ? "Retry queued" : "Unlinked");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not ${action}`);
    }
    setBusy(null);
  }

  const mismatches = links.filter((l) => l.mismatch);
  const shown = showAll ? links : mismatches;

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => router.push("/settings")} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">Greenhouse (Harvest API). Other ATS providers arrive in Phase 3.</p>
        </div>

        <div className="space-y-6">
          <Card data-testid="ats-connection-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-emerald-700" />
                <CardTitle className="text-lg">Greenhouse</CardTitle>
              </div>
              <CardDescription>
                {status === null ? "Loading…" : status.connected ? "Connected. Jobs import every 6 hours and on demand; new applications and finished interview reports are pushed automatically." : "Not connected. Enter a Harvest API key with Jobs, Candidates and Applications permissions."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status?.connected ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="rounded-md border p-3"><p className="text-gray-500">Last sync</p><p className="font-medium text-gray-900" data-testid="ats-last-sync">{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "never"}</p></div>
                    <div className="rounded-md border p-3"><p className="text-gray-500">Status</p><p className="font-medium text-gray-900 flex items-center gap-1">{status.syncError ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{status.syncStatus ?? "idle"}{status.syncError ? ` — ${status.syncError}` : ""}</p></div>
                    <div className="rounded-md border p-3"><p className="text-gray-500">Links</p><p className="font-medium text-gray-900">{Object.entries(status.links ?? {}).filter(([k]) => !["idempotency", "webhook-event"].includes(k)).map(([k, v]) => `${v} ${k}`).join(" · ") || "none yet"}</p></div>
                    <div className="rounded-md border p-3"><p className="text-gray-500">Webhook</p><p className="font-medium text-gray-900 break-all text-xs">{status.webhookConfigured ? status.webhookUrl : "No secret set — add one and reconnect to receive stage changes"}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={sync} disabled={busy !== null}>{busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}Import jobs now</Button>
                    <Button variant="outline" className="border-red-300 text-red-600" onClick={disconnect} disabled={busy !== null}>{busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}Disconnect</Button>
                  </div>
                </>
              ) : status ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="gh-api-key">Harvest API key</Label>
                    <Input id="gh-api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste a Harvest API key" autoComplete="off" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="gh-on-behalf-of">On-Behalf-Of user id (for writes)</Label>
                      <Input id="gh-on-behalf-of" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)} placeholder="e.g. 4012345" />
                    </div>
                    <div>
                      <Label htmlFor="gh-webhook-secret">Webhook secret key (optional)</Label>
                      <Input id="gh-webhook-secret" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="off" />
                    </div>
                  </div>
                  <Button onClick={connect} disabled={busy !== null || !apiKey} data-testid="ats-connect">{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}Connect Greenhouse</Button>
                  <p className="text-xs text-gray-500">The key is verified against Harvest and stored encrypted (AES-256-GCM). It is never shown again.</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {status?.connected && (
            <Card data-testid="ats-reconciliation-card">
              <CardHeader>
                <CardTitle className="text-lg">Reconciliation</CardTitle>
                <CardDescription>{mismatches.length === 0 ? "No unexplained mismatches." : `${mismatches.length} link(s) need attention.`} <button className="underline ml-2" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show mismatches only" : `Show all ${links.length} links`}</button></CardDescription>
              </CardHeader>
              <CardContent>
                {shown.length === 0 ? (
                  <p className="text-sm text-gray-500">Nothing to show.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Local</th><th className="py-2 pr-3">Remote</th><th className="py-2 pr-3">Last synced</th><th className="py-2 pr-3">State</th><th className="py-2"></th></tr></thead>
                      <tbody>
                        {shown.map((l) => (
                          <tr key={l.id} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3 font-medium">{l.localType}</td>
                            <td className="py-2 pr-3 font-mono text-xs">{l.localId}{l.local && "title" in l.local ? <div className="text-gray-500">{String(l.local.title)} · {String(l.local.status)}</div> : null}</td>
                            <td className="py-2 pr-3 font-mono text-xs">{l.remoteId}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">{new Date(l.lastSyncedAt).toLocaleString()}</td>
                            <td className="py-2 pr-3 text-xs">{l.mismatch ? <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{l.mismatch}</span> : <span className="text-emerald-700">in sync</span>}</td>
                            <td className="py-2 text-right whitespace-nowrap">
                              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => linkAction(l, "retry")}><RotateCw className="h-3.5 w-3.5 mr-1" />Retry</Button>{" "}
                              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => linkAction(l, "unlink")}><Unlink className="h-3.5 w-3.5 mr-1" />Unlink</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {status?.connected && (status.runs?.length ?? 0) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent sync runs</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {status.runs!.map((r) => (
                    <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2">
                      <span>{r.direction} · {r.trigger}</span>
                      <span className={r.status === "success" ? "text-emerald-700" : r.status === "error" ? "text-red-700" : "text-amber-700"}>{r.status}</span>
                      <span className="text-gray-500">{r.counts ? Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(" · ") : ""}</span>
                      <span className="text-gray-500">{new Date(r.startedAt).toLocaleString()}</span>
                      {r.errors && r.errors.length > 0 && <span className="w-full text-xs text-red-700">{r.errors[0].message}</span>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

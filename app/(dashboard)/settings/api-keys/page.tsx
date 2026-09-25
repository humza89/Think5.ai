"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Key, Copy, Plus, Trash2, Loader2 } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Phase 0 T10: real keys on the additive ApiKey model; the secret is shown once at creation. */
export default function ApiKeysSettingsPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [plaintext, setPlaintext] = useState<{ id: string; value: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/account/api-keys", { cache: "no-store" });
      if (res.ok) setKeys((await res.json()).keys ?? []);
    } catch {
      toast.error("Could not load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreateKey() {
    if (!newKeyName.trim()) return void toast.warning("Please enter a name for the API key");
    setCreating(true);
    try {
      const res = await apiFetch("/api/account/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create API key");
      setPlaintext({ id: data.key.id, value: data.plaintext });
      setNewKeyName("");
      setShowCreateForm(false);
      toast.success("API key created. Copy it now; it will not be shown again.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key");
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    try {
      const res = await apiFetch("/api/account/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to revoke API key");
      toast.success("API key revoked");
      if (plaintext?.id === id) setPlaintext(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={() => router.push("/settings")} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
        </button>
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
            <p className="text-sm text-gray-500 mt-1">Bearer keys for <code className="font-mono text-xs">/api/v1/*</code>. Send <code className="font-mono text-xs">Authorization: Bearer t5_…</code>.</p>
          </div>
          <Button onClick={() => setShowCreateForm(true)} disabled={showCreateForm}><Plus className="h-4 w-4 mr-2" />New key</Button>
        </div>

        {plaintext && (
          <Card className="mb-6 border-emerald-300 bg-emerald-50" data-testid="api-key-plaintext">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-emerald-900">Copy your new key now. It is stored hashed and cannot be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs">{plaintext.value}</code>
                <Button size="sm" variant="outline" onClick={() => copy(plaintext.value)}><Copy className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPlaintext(null)}>I have copied it</Button>
            </CardContent>
          </Card>
        )}

        {showCreateForm && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Create API key</CardTitle><CardDescription>Choose a name you will recognise and the scopes the key needs.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="api-key-name">Name</Label>
                <Input id="api-key-name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. HRIS sync" maxLength={80} />
              </div>
              <div className="flex gap-4">
                {(["read", "write"] as const).map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={newKeyScopes.includes(scope)} onChange={(e) => setNewKeyScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))} />
                    {scope}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowCreateForm(false); setNewKeyName(""); }}>Cancel</Button>
                <Button onClick={handleCreateKey} disabled={creating || newKeyScopes.length === 0}>{creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create key</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Key className="h-5 w-5 text-gray-500" /><CardTitle className="text-lg">Active keys</CardTitle></div>
            <CardDescription>Revoking a key takes effect immediately.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : active.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="api-keys-empty">No API keys yet.</p>
            ) : (
              <ul className="divide-y" data-testid="api-keys-list">
                {active.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{k.name}</p>
                      <p className="font-mono text-xs text-gray-500">t5_{k.prefix}_•••••••• · {k.scopes.join(", ")}</p>
                      <p className="text-xs text-gray-400">Created {new Date(k.createdAt).toLocaleDateString()} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-600" onClick={() => handleRevoke(k.id)}><Trash2 className="h-4 w-4 mr-1" />Revoke</Button>
                  </li>
                ))}
              </ul>
            )}
            {revoked.length > 0 && <p className="mt-4 text-xs text-gray-400">{revoked.length} revoked key(s) kept for audit.</p>}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "sonner";
import { ArrowLeft, Key, Copy, Eye, EyeOff, Plus, Trash2, Loader2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

export default function ApiKeysSettingsPage() {
  const router = useRouter();

  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: "1",
      name: "Production Integration",
      key: "pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      createdAt: "2025-12-15",
      lastUsed: "2026-02-20",
    },
    {
      id: "2",
      name: "Development",
      key: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      createdAt: "2026-01-10",
      lastUsed: null,
    },
  ]);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");

  function toggleKeyVisibility(id: string) {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("API key copied to clipboard");
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) {
      toast.warning("Please enter a name for the API key");
      return;
    }

    setCreating(true);
    try {
      // Simulate API key creation (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 600));
      const newKey: ApiKey = {
        id: Date.now().toString(),
        name: newKeyName,
        key: `pk_live_${Array.from({ length: 28 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("")}`,
        createdAt: new Date().toISOString().split("T")[0],
        lastUsed: null,
      };
      setKeys((prev) => [newKey, ...prev]);
      setNewKeyName("");
      setShowCreateForm(false);
      setVisibleKeys((prev) => ({ ...prev, [newKey.id]: true }));
      toast.success("API key created successfully. Make sure to copy it now.");
    } catch {
      toast.error("Failed to create API key");
    }
    setCreating(false);
  }

  async function handleDeleteKey(id: string) {
    try {
      // Simulate API key deletion (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 400));
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke API key");
    }
  }

  function maskKey(key: string): string {
    return key.substring(0, 8) + "..." + key.substring(key.length - 4);
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </button>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage API keys for external integrations
            </p>
          </div>
          {!showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Key
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {/* Create New Key Form */}
          {showCreateForm && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardHeader>
                <CardTitle className="text-lg">Create New API Key</CardTitle>
                <CardDescription>
                  Give your key a descriptive name to identify its purpose
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Key Name</Label>
                  <Input
                    placeholder="e.g. Production Integration, CI/CD Pipeline"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewKeyName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKey} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Generate Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing Keys */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-lg">Active Keys</CardTitle>
              </div>
              <CardDescription>
                {keys.length} active API {keys.length === 1 ? "key" : "keys"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {keys.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No API keys yet</p>
                  <p className="text-xs mt-1">Create one to get started with integrations</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {keys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="flex items-center justify-between py-3 border-b last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{apiKey.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-600">
                            {visibleKeys[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                          </code>
                          <button
                            onClick={() => toggleKeyVisibility(apiKey.id)}
                            className="text-gray-400 hover:text-gray-600"
                            title={visibleKeys[apiKey.id] ? "Hide key" : "Show key"}
                          >
                            {visibleKeys[apiKey.id] ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(apiKey.key)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Copy key"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex gap-4 mt-1.5">
                          <span className="text-xs text-gray-400">
                            Created: {apiKey.createdAt}
                          </span>
                          <span className="text-xs text-gray-400">
                            Last used: {apiKey.lastUsed ?? "Never"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteKey(apiKey.id)}
                        className="text-gray-400 hover:text-red-500 ml-4"
                        title="Revoke key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Notice */}
          <Card className="bg-gray-50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Key className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">
                    API keys grant full access to your account through the API. Keep them
                    secure and never share them publicly. Revoke any keys that may have been
                    compromised.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}

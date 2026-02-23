"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Plus,
  User,
  Mail,
  Link as LinkIcon,
  Loader2,
  Trash2,
} from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  CREATED: { label: "Created", className: "bg-gray-100 text-gray-700" },
  INVITED: { label: "Invited", className: "bg-blue-100 text-blue-700" },
  LINKED: { label: "Linked", className: "bg-green-100 text-green-700" },
  EXPIRED: { label: "Expired", className: "bg-red-100 text-red-700" },
};

export default function PassiveProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", linkedinUrl: "", firstName: "", lastName: "" });

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    try {
      const res = await fetch("/api/passive-profiles");
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      setProfiles([]);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.email && !form.linkedinUrl) {
      alert("Email or LinkedIn URL is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/passive-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "manual" }),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ email: "", linkedinUrl: "", firstName: "", lastName: "" });
        fetchProfiles();
      }
    } catch {}
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this profile?")) return;
    try {
      await fetch(`/api/passive-profiles/${id}`, { method: "DELETE" });
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Passive Profiles</h1>
              <p className="text-sm text-gray-500 mt-1">
                Pre-created candidate profiles for sourcing and outreach
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Profile
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : profiles.length === 0 ? (
            <Card className="p-12 text-center">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No passive profiles</h3>
              <p className="text-gray-500 mb-4">
                Create profiles for candidates you want to source
              </p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Profile
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((p: any) => {
                const status = statusConfig[p.status] || statusConfig.CREATED;
                return (
                  <Card key={p.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {[p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed"}
                            </p>
                            {p.email && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {p.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge className={status.className}>{status.label}</Badge>
                      </div>
                      {p.linkedinUrl && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mb-3 truncate">
                          <LinkIcon className="h-3 w-3 shrink-0" />
                          {p.linkedinUrl}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                        <span>Source: {p.source || "manual"}</span>
                        <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Create Dialog */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Passive Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>First Name</Label>
                    <Input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={form.linkedinUrl}
                    onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ProtectedRoute>
  );
}

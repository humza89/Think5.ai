"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, User } from "lucide-react";

interface RecruiterProfile {
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  linkedinUrl: string | null;
  bio: string | null;
  company?: { id: string; name: string } | null;
}

/** Phase 0 T10: Settings → Profile edits the recruiter's own Recruiter row (it used to link to the candidate profile). */
export default function RecruiterProfileSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/recruiter/profile", { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).profile : null))
      .then((p) => setProfile(p))
      .catch(() => toast.error("Could not load your profile"))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof RecruiterProfile>(key: K, value: RecruiterProfile[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/recruiter/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profile.name, phone: profile.phone ?? "", title: profile.title ?? "", department: profile.department ?? "", linkedinUrl: profile.linkedinUrl ?? "", bio: profile.bio ?? "" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setProfile((prev) => (prev ? { ...prev, ...data.profile } : prev));
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
    setSaving(false);
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={() => router.push("/settings")} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 mt-1">How you appear to candidates and teammates</p>
        </div>
        <Card data-testid="recruiter-profile-card">
          <CardHeader>
            <div className="flex items-center gap-2"><User className="h-5 w-5 text-gray-500" /><CardTitle className="text-lg">Recruiter details</CardTitle></div>
            <CardDescription>{profile?.company ? `Member of ${profile.company.name}` : "Not yet linked to a company"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading || !profile ? (
              <p className="text-sm text-gray-500">{loading ? "Loading…" : "No recruiter profile found for this account."}</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="rp-name">Full name</Label><Input id="rp-name" value={profile.name} onChange={(e) => set("name", e.target.value)} /></div>
                  <div><Label htmlFor="rp-email">Email</Label><Input id="rp-email" value={profile.email} disabled /></div>
                  <div><Label htmlFor="rp-title">Title</Label><Input id="rp-title" value={profile.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Head of Talent" /></div>
                  <div><Label htmlFor="rp-department">Department</Label><Input id="rp-department" value={profile.department ?? ""} onChange={(e) => set("department", e.target.value)} /></div>
                  <div><Label htmlFor="rp-phone">Phone</Label><Input id="rp-phone" value={profile.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
                  <div><Label htmlFor="rp-linkedin">LinkedIn URL</Label><Input id="rp-linkedin" value={profile.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/…" /></div>
                </div>
                <div>
                  <Label htmlFor="rp-bio">Bio</Label>
                  <textarea id="rp-bio" value={profile.bio ?? ""} onChange={(e) => set("bio", e.target.value)} className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm" maxLength={2000} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving || !profile.name.trim()} data-testid="save-recruiter-profile">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save profile</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

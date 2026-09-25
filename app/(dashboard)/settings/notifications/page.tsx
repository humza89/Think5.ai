"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowLeft, Bell, Mail, MessageSquare, Briefcase, Users, Loader2, Smartphone, AlertTriangle } from "lucide-react";

type PreferenceField = "emailNotifications" | "pushNotifications" | "interviewInvites" | "applicationUpdates" | "matchAlerts" | "feedbackReady" | "systemAlerts";

/** Phase 0 T10: toggles are the NotificationPreference columns, loaded and saved through /api/account/notification-preferences. */
const NOTIFICATION_SETTINGS: Array<{ id: PreferenceField; label: string; description: string; icon: React.ElementType; category: "channels" | "events" }> = [
  { id: "emailNotifications", label: "Email", description: "Send notifications to your email address", icon: Mail, category: "channels" },
  { id: "pushNotifications", label: "In-app", description: "Show notifications inside Think5", icon: Smartphone, category: "channels" },
  { id: "applicationUpdates", label: "Applications", description: "New applications and status changes in your pipelines", icon: Briefcase, category: "events" },
  { id: "interviewInvites", label: "Interview invitations", description: "When an interview invitation is sent or accepted", icon: MessageSquare, category: "events" },
  { id: "feedbackReady", label: "Reports ready", description: "When an AI interview report is ready to review", icon: Bell, category: "events" },
  { id: "matchAlerts", label: "Candidate matches", description: "When a high-quality match is found for your role", icon: Users, category: "events" },
  { id: "systemAlerts", label: "System alerts", description: "Security and account notices (recommended on)", icon: AlertTriangle, category: "events" },
];

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<PreferenceField, boolean>>({ emailNotifications: true, pushNotifications: true, interviewInvites: true, applicationUpdates: true, matchAlerts: true, feedbackReady: true, systemAlerts: true });

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/account/notification-preferences", { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).preferences : null))
      .then((prefs) => {
        if (cancelled || !prefs) return;
        setSettings((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(prev) as PreferenceField[]) if (typeof prefs[key] === "boolean") next[key] = prefs[key];
          return next;
        });
      })
      .catch(() => toast.error("Could not load notification preferences"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleSetting(id: PreferenceField) {
    setSettings((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/account/notification-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save notification preferences");
    }
    setSaving(false);
  }

  const groups: Array<{ key: "channels" | "events"; title: string; description: string }> = [
    { key: "channels", title: "Channels", description: "Where notifications are delivered" },
    { key: "events", title: "Events", description: "What you are notified about" },
  ];

  return (
    <ProtectedRoute>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={() => router.push("/settings")} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">Choose how and when Think5 notifies you</p>
        </div>
        <div className="space-y-6" data-testid="notification-settings">
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {NOTIFICATION_SETTINGS.filter((s) => s.category === group.key).map((setting) => {
                  const Icon = setting.icon;
                  return (
                    <div key={setting.id} className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{setting.label}</p>
                          <p className="text-xs text-gray-500">{setting.description}</p>
                        </div>
                      </div>
                      <Switch checked={settings[setting.id]} onCheckedChange={() => toggleSetting(setting.id)} disabled={loading} aria-label={setting.label} data-testid={`pref-${setting.id}`} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || loading} data-testid="save-notification-preferences">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save preferences
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

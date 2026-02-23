"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "sonner";
import { ArrowLeft, Bell, Mail, MessageSquare, Briefcase, Users, Loader2 } from "lucide-react";

const NOTIFICATION_SETTINGS = [
  {
    id: "email_new_application",
    label: "New Applications",
    description: "Get notified when a candidate applies to your job",
    icon: Briefcase,
    category: "email",
  },
  {
    id: "email_interview_complete",
    label: "Interview Completed",
    description: "Notification when an AI interview is finished",
    icon: MessageSquare,
    category: "email",
  },
  {
    id: "email_candidate_match",
    label: "New Candidate Match",
    description: "When a high-quality match is found for your role",
    icon: Users,
    category: "email",
  },
  {
    id: "inapp_new_application",
    label: "New Applications",
    description: "In-app notification for new applications",
    icon: Briefcase,
    category: "in_app",
  },
  {
    id: "inapp_interview_complete",
    label: "Interview Completed",
    description: "In-app notification when interviews complete",
    icon: MessageSquare,
    category: "in_app",
  },
  {
    id: "inapp_status_change",
    label: "Status Changes",
    description: "When application status changes in pipeline",
    icon: Bell,
    category: "in_app",
  },
];

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    NOTIFICATION_SETTINGS.forEach((s) => {
      defaults[s.id] = true;
    });
    return defaults;
  });

  function toggleSetting(id: string) {
    setSettings((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Simulate saving preferences (replace with actual API call when available)
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save notification preferences");
    }
    setSaving(false);
  }

  const emailSettings = NOTIFICATION_SETTINGS.filter((s) => s.category === "email");
  const inAppSettings = NOTIFICATION_SETTINGS.filter((s) => s.category === "in_app");

  return (
    <ProtectedRoute>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure how and when you receive notifications
          </p>
        </div>

        <div className="space-y-6">
          {/* Email Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Email Notifications</CardTitle>
              </div>
              <CardDescription>
                Choose which email notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {emailSettings.map((setting) => {
                const Icon = setting.icon;
                return (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between py-3 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{setting.label}</p>
                        <p className="text-xs text-gray-500">{setting.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings[setting.id]}
                      onCheckedChange={() => toggleSetting(setting.id)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* In-App Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">In-App Notifications</CardTitle>
              </div>
              <CardDescription>
                Manage notifications that appear within the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {inAppSettings.map((setting) => {
                const Icon = setting.icon;
                return (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between py-3 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{setting.label}</p>
                        <p className="text-xs text-gray-500">{setting.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings[setting.id]}
                      onCheckedChange={() => toggleSetting(setting.id)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Preferences
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

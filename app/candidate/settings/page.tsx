"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Settings,
  Mail,
  Bell,
  Shield,
  AlertTriangle,
  Loader2,
  Eye,
  Lock,
  CalendarCheck,
  FileCheck,
  Target,
  MessageSquare,
  Monitor,
} from "lucide-react";

interface NotificationPreferences {
  emailNotifications: boolean;
  interviewInvites: boolean;
  applicationUpdates: boolean;
  matchAlerts: boolean;
  feedbackReady: boolean;
  systemAlerts: boolean;
}

interface SettingsData {
  email: string;
  profileVisible: boolean;
  notifications: NotificationPreferences;
}

const notificationOptions: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    key: "emailNotifications",
    label: "Email Notifications",
    description: "Receive notifications via email",
    icon: Mail,
  },
  {
    key: "interviewInvites",
    label: "Interview Invites",
    description: "Get notified about new interview invitations",
    icon: CalendarCheck,
  },
  {
    key: "applicationUpdates",
    label: "Application Updates",
    description: "Updates on your job applications status",
    icon: FileCheck,
  },
  {
    key: "matchAlerts",
    label: "Match Alerts",
    description: "When new jobs match your profile",
    icon: Target,
  },
  {
    key: "feedbackReady",
    label: "Feedback Ready",
    description: "When interview feedback is available",
    icon: MessageSquare,
  },
  {
    key: "systemAlerts",
    label: "System Alerts",
    description: "Important platform announcements",
    icon: Monitor,
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/candidate/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (updates: Partial<SettingsData>, fieldName: string) => {
    setSavingField(fieldName);
    try {
      const res = await fetch("/api/candidate/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        toast.success("Settings updated");
      } else {
        toast.error("Failed to update settings");
        fetchSettings(); // revert
      }
    } catch {
      toast.error("An error occurred");
      fetchSettings();
    } finally {
      setSavingField(null);
    }
  };

  const handleNotificationToggle = (key: keyof NotificationPreferences) => {
    if (!settings) return;
    const updated = {
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    };
    setSettings(updated);
    saveSettings(
      { notifications: updated.notifications },
      `notification-${key}`
    );
  };

  const handlePrivacyToggle = () => {
    if (!settings) return;
    const updated = { ...settings, profileVisible: !settings.profileVisible };
    setSettings(updated);
    saveSettings({ profileVisible: updated.profileVisible }, "profileVisible");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/candidate/settings", {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Account deleted");
        window.location.href = "/";
      } else {
        toast.error("Failed to delete account");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
            <p className="text-muted-foreground">Manage your account preferences.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="w-8 h-8 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container mx-auto px-6 max-w-3xl">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences.
          </p>
        </div>

        <div className="space-y-6">
          {/* Account Section */}
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-lg">Account</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Your account information
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="text-foreground/80 mb-2 block">Email</Label>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{settings?.email || "Not available"}</span>
                </div>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:bg-accent rounded-xl"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-lg">
                    Notification Preferences
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Choose which notifications you receive
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {notificationOptions.map((option) => {
                  const Icon = option.icon;
                  const isLoading = savingField === `notification-${option.key}`;
                  return (
                    <div
                      key={option.key}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-foreground text-sm font-medium">
                            {option.label}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLoading && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        )}
                        <Switch
                          checked={settings?.notifications?.[option.key] ?? false}
                          onCheckedChange={() => handleNotificationToggle(option.key)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Privacy */}
          <Card className="border-border bg-card shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-lg">Privacy</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Control who can see your profile
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    Profile visible to recruiters
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Allow recruiters to discover and view your profile
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {savingField === "profileVisible" && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={settings?.profileVisible ?? false}
                    onCheckedChange={handlePrivacyToggle}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-500/20 bg-red-500/5 shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-red-400 text-lg">
                    Danger Zone
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Irreversible actions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!showDeleteConfirm ? (
                <div>
                  <p className="text-muted-foreground text-sm mb-4">
                    Once you delete your account, there is no going back. All your data,
                    applications, and conversations will be permanently removed.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl"
                  >
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Type <span className="text-red-400 font-mono font-bold">DELETE</span> to confirm account deletion.
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="bg-card border-red-500/20 text-foreground placeholder:text-muted-foreground focus:border-red-500/50 rounded-xl"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== "DELETE" || deleting}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                    >
                      {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Delete My Account
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                      className="border-border text-foreground hover:bg-accent rounded-xl"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

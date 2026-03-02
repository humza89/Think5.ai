"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Target,
  MessageSquare,
  Clock,
  CheckCheck,
  Loader2,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeIcons: Record<string, React.ElementType> = {
  system: Bell,
  interview_invite: Mail,
  application_update: Briefcase,
  match: Target,
  feedback: MessageSquare,
  success: CheckCircle,
  alert: AlertCircle,
};

const typeColors: Record<string, string> = {
  system: "text-white/40",
  interview_invite: "text-blue-400",
  application_update: "text-purple-400",
  match: "text-green-400",
  feedback: "text-amber-400",
  success: "text-green-400",
  alert: "text-red-400",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/candidate/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/candidate/notifications`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: true }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
      }
    } catch {
      toast.error("Failed to update notification");
    }
  };

  const markAllRead = async () => {
    setMarkingAllRead(true);
    try {
      const res = await fetch("/api/candidate/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        toast.success("All notifications marked as read");
      }
    } catch {
      toast.error("Failed to update notifications");
    } finally {
      setMarkingAllRead(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.read;
    if (activeTab === "read") return n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderEmptyState = () => {
    let message = "No notifications yet.";
    if (activeTab === "unread") message = "No unread notifications.";
    if (activeTab === "read") message = "No read notifications.";

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
        <Bell className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">All caught up</h3>
        <p className="text-white/40 text-sm">{message}</p>
      </div>
    );
  };

  return (
    <div>
      <div className="container mx-auto px-6 max-w-3xl">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">Notifications</h1>
              {unreadCount > 0 && (
                <Badge className="bg-blue-500 text-white">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <p className="text-white/50">
              Stay updated on your applications and messages.
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              onClick={markAllRead}
              disabled={markingAllRead}
              variant="outline"
              className="border-white/10 text-white hover:bg-white/10 rounded-xl"
            >
              {markingAllRead ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <CheckCheck className="w-4 h-4 mr-1.5" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/50"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/50"
            >
              Unread
              {unreadCount > 0 && (
                <span className="ml-1.5 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="read"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/50"
            >
              Read
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white/40">Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              renderEmptyState()
            ) : (
              <div className="space-y-2">
                {filteredNotifications.map((notification) => {
                  const Icon =
                    typeIcons[notification.type] || typeIcons.system;
                  const iconColor =
                    typeColors[notification.type] || typeColors.system;

                  return (
                    <button
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) {
                          markAsRead(notification.id);
                        }
                      }}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 transition-colors",
                        notification.read
                          ? "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                          : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                            notification.read ? "bg-white/5" : "bg-blue-500/10"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-4.5 h-4.5",
                              notification.read ? "text-white/30" : iconColor
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4
                              className={cn(
                                "text-sm font-medium truncate",
                                notification.read ? "text-white/60" : "text-white"
                              )}
                            >
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </div>
                          <p
                            className={cn(
                              "text-xs line-clamp-2",
                              notification.read ? "text-white/30" : "text-white/50"
                            )}
                          >
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <Clock className="w-3 h-3 text-white/20" />
                            <span className="text-xs text-white/30">
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

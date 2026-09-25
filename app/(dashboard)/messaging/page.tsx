"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Search,
  Inbox,
  User,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  isOwn: boolean;
}

interface Conversation {
  id: string;
  participantName: string;
  participantTitle?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MessagingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-16rem)]">
        <Card className="lg:col-span-1">
          <CardContent className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="flex items-center justify-center h-full">
            <Skeleton className="h-6 w-64" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      // T8: canonical contract (lib/messaging/contract.ts)
      const res = await apiFetch("/api/messaging/conversations");
      if (!res.ok) throw new Error(`Failed to fetch messages (${res.status})`);
      const data = (await res.json()) as {
        conversations: Array<{ id: string; participant: { name: string; role: string }; lastMessage: string | null; lastMessageAt: string | null; unreadCount: number }>;
      };
      setConversations((prev) =>
        data.conversations.map((c) => ({
          id: c.id,
          participantName: c.participant.name,
          participantTitle: c.participant.role === "CANDIDATE" ? "Candidate" : "Recruiter",
          lastMessage: c.lastMessage ?? undefined,
          lastMessageAt: c.lastMessageAt ?? undefined,
          unreadCount: c.unreadCount,
          messages: prev.find((p) => p.id === c.id)?.messages ?? [],
        })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load messages";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // T8: load the thread for the selected conversation and record the read receipt.
  const loadThread = useCallback(async (conversationId: string) => {
    const res = await apiFetch(`/api/messaging/conversations/${conversationId}/messages`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Array<{ id: string; content: string; senderId: string; createdAt: string; isOwn: boolean }> };
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              unreadCount: 0,
              messages: data.messages.map((m) => ({
                id: m.id,
                content: m.content,
                senderId: m.senderId,
                senderName: m.isOwn ? "You" : conv.participantName,
                createdAt: m.createdAt,
                isOwn: m.isOwn,
              })),
            }
          : conv,
      ),
    );
    apiFetch(`/api/messaging/conversations/${conversationId}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  // T8: live updates without polling; the stream reconnects itself.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/messaging/stream");
    source.addEventListener("message", () => {
      fetchConversations();
      if (selectedId) loadThread(selectedId);
    });
    return () => source.close();
  }, [fetchConversations, loadThread, selectedId]);

  // Scroll to bottom of messages when conversation changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, conversations]);

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  const filteredConversations = conversations.filter((c) =>
    c.participantName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedId) return;

    setSending(true);
    try {
      const res = await apiFetch(`/api/messaging/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage.trim() }),
      });
      if (!res.ok) throw new Error(`Failed to send message (${res.status})`);
      const { message } = (await res.json()) as { message: { id: string; content: string; senderId: string; createdAt: string } };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedId
            ? {
                ...conv,
                lastMessage: message.content,
                lastMessageAt: message.createdAt,
                messages: [
                  ...conv.messages,
                  { id: message.id, content: message.content, senderId: message.senderId, senderName: "You", createdAt: message.createdAt, isOwn: true },
                ],
              }
            : conv
        )
      );
      setNewMessage("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  if (loading) return <MessagingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Messaging
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Communicate with candidates
        </p>
      </div>

      {/* Chat layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-16rem)] min-h-[500px]">
        {/* Conversation list */}
        <Card className="lg:col-span-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-background"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {filteredConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Inbox className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {searchQuery ? "No conversations match your search" : "No conversations yet"}
                </p>
              </div>
            )}
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors border-b border-border last:border-0",
                  selectedId === conv.id && "bg-accent"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {conv.participantName}
                    </p>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTimestamp(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.lastMessage || "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge className="h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5 bg-blue-600 text-white shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Message thread */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          {!selectedConversation ? (
            <CardContent className="flex-1 flex flex-col items-center justify-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Select a conversation
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a conversation from the list to start messaging
              </p>
            </CardContent>
          ) : (
            <>
              {/* Thread header */}
              <CardHeader className="pb-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {selectedConversation.participantName}
                    </CardTitle>
                    {selectedConversation.participantTitle && (
                      <CardDescription className="text-xs">
                        {selectedConversation.participantTitle}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedConversation.messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Start the conversation below.
                    </p>
                  </div>
                )}
                {selectedConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.isOwn ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2.5",
                        msg.isOwn
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={cn(
                          "text-[10px] mt-1",
                          msg.isOwn ? "text-blue-200" : "text-muted-foreground"
                        )}
                      >
                        {formatMessageTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-4 border-t border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    className="flex-1 bg-background"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={sending || !newMessage.trim()}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

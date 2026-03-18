"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  User,
  Loader2,
  Clock,
} from "lucide-react";

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderRole: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export default function MessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        if (data.currentUserId) {
          setCurrentUserId(data.currentUserId);
        }
      }
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?conversationId=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    setSendingMessage(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          content: newMessage.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage("");
      } else {
        toast.error("Failed to send message");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
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

  return (
    <div>
      <div className="container mx-auto px-6">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Messages</h1>
          <p className="text-muted-foreground">
            Your conversations with recruiters.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden" style={{ height: "calc(100vh - 260px)", minHeight: "500px" }}>
          <div className="flex h-full">
            {/* Conversation List */}
            <div
              className={cn(
                "w-full md:w-80 lg:w-96 border-r border-border flex flex-col",
                selectedConversation && "hidden md:flex"
              )}
            >
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Conversations
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="w-6 h-6 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">Loading...</p>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">
                      No messages yet. Recruiters will reach out when there is a match.
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "w-full text-left p-4 border-b border-border hover:bg-card transition-colors",
                        selectedConversation?.id === conv.id && "bg-accent"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-foreground font-medium text-sm truncate">
                              {conv.participantName || `Recruiter`}
                            </span>
                            <span className="text-muted-foreground text-xs flex-shrink-0 ml-2">
                              {formatTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs truncate">
                            {conv.lastMessage}
                          </p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] flex items-center justify-center">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Message Thread */}
            <div
              className={cn(
                "flex-1 flex flex-col",
                !selectedConversation && "hidden md:flex"
              )}
            >
              {selectedConversation ? (
                <>
                  {/* Thread Header */}
                  <div className="p-4 border-b border-border flex items-center gap-3">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-medium text-sm">
                        {selectedConversation.participantName || "Recruiter"}
                      </h3>
                      <p className="text-muted-foreground text-xs">
                        {selectedConversation.participantRole || "Recruiter"}
                      </p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-6 h-6 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-muted-foreground text-sm">Loading messages...</p>
                        </div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                          <p className="text-muted-foreground text-sm">
                            No messages yet. Start the conversation!
                          </p>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isSent = msg.senderId === currentUserId;
                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex",
                              isSent ? "justify-end" : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[75%] rounded-2xl px-4 py-2.5",
                                isSent
                                  ? "bg-blue-600 text-white rounded-br-md"
                                  : "bg-accent text-foreground rounded-bl-md"
                              )}
                            >
                              <p className="text-sm">{msg.content}</p>
                              <p
                                className={cn(
                                  "text-xs mt-1",
                                  isSent ? "text-blue-200/60" : "text-muted-foreground"
                                )}
                              >
                                {formatTime(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center gap-3">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className="flex-1 h-11 bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sendingMessage}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 w-11 p-0"
                      >
                        {sendingMessage ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-1">
                      Select a conversation
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Choose a conversation from the list to view messages.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Mic, MicOff } from "lucide-react";

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
}

interface CandidatePanelProps {
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  voiceSupported: boolean;
  isListening: boolean;
  voiceTranscript: string;
  onToggleVoice: () => void;
  onResetVoice: () => void;
}

export function CandidatePanel({
  messages,
  isStreaming,
  onSendMessage,
  voiceSupported,
  isListening,
  voiceTranscript,
  onToggleVoice,
  onResetVoice,
}: CandidatePanelProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const candidateMessages = messages.filter((m) => m.role === "candidate");

  // Append voice transcript to input
  useEffect(() => {
    if (voiceTranscript) {
      setInput((prev) => prev + voiceTranscript);
      onResetVoice();
    }
  }, [voiceTranscript, onResetVoice]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [candidateMessages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <h3 className="text-white font-semibold">Your Responses</h3>
        <p className="text-zinc-500 text-sm">
          Type your answer and press Ctrl+Enter to send
        </p>
      </div>

      {/* Previous responses */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {candidateMessages.map((msg) => (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[85%]">
              <div className="bg-violet-600/20 border border-violet-500/30 rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
              <span className="text-zinc-600 text-xs mt-1 block text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}

        {candidateMessages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm text-center">
              Your responses will appear here
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? "Wait for Aria to finish..."
                : "Type your response..."
            }
            className="w-full min-h-[120px] max-h-[200px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 pr-24 text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {/* Character count */}
            <span className="text-zinc-600 text-xs">
              {input.length > 0 && input.length}
            </span>

            {/* Voice input toggle */}
            {voiceSupported && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleVoice}
                disabled={isStreaming}
                className={`h-8 w-8 ${
                  isListening
                    ? "text-red-400 hover:text-red-300 bg-red-500/10"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
            )}

            {/* Send button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="h-8 w-8 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {isListening && (
          <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            Listening... speak now
          </p>
        )}
      </div>
    </div>
  );
}

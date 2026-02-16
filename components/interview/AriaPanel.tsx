"use client";

import { useEffect, useRef } from "react";

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: string;
}

interface AriaPanelProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

export function AriaPanel({ messages, streamingText, isStreaming }: AriaPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const ariaMessages = messages.filter((m) => m.role === "interviewer");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Aria</h3>
            {isStreaming ? (
              <div className="flex items-center gap-1">
                <span className="text-violet-400 text-sm">typing</span>
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            ) : (
              <span className="text-zinc-500 text-sm">AI Interviewer</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {ariaMessages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex-shrink-0 flex items-center justify-center mt-1">
              <span className="text-violet-400 font-bold text-xs">A</span>
            </div>
            <div className="flex-1">
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>
              <span className="text-zinc-600 text-xs mt-1 block">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {isStreaming && streamingText && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex-shrink-0 flex items-center justify-center mt-1">
              <span className="text-violet-400 font-bold text-xs">A</span>
            </div>
            <div className="flex-1">
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-0.5 h-5 bg-violet-400 ml-0.5 animate-pulse" />
              </p>
            </div>
          </div>
        )}

        {/* Loading state before first chunk */}
        {isStreaming && !streamingText && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex-shrink-0 flex items-center justify-center mt-1">
              <span className="text-violet-400 font-bold text-xs">A</span>
            </div>
            <div className="flex gap-1 items-center py-3">
              <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

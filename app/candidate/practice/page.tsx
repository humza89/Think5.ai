"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Mic,
  Video,
  Shield,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const PRACTICE_TYPES = [
  {
    type: "TECHNICAL",
    label: "Technical Interview",
    description:
      "Practice system design, coding patterns, and technical problem-solving questions.",
    duration: "15-20 min",
    icon: "💻",
  },
  {
    type: "BEHAVIORAL",
    label: "Behavioral Interview",
    description:
      "Practice STAR-method responses for leadership, teamwork, and conflict scenarios.",
    duration: "15-20 min",
    icon: "🤝",
  },
  {
    type: "CASE_STUDY",
    label: "Case Study",
    description:
      "Practice structured problem decomposition and data-driven reasoning.",
    duration: "20-25 min",
    icon: "📊",
  },
];

export default function PracticeInterviewPage() {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStartPractice(type: string) {
    setStarting(type);
    setError(null);

    try {
      const res = await fetch("/api/candidate/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start practice interview");
      }

      const data = await res.json();
      router.push(`/interview/${data.interviewId}?token=${data.accessToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStarting(null);
    }
  }

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Practice Interviews</h1>
        <p className="text-muted-foreground mt-1">
          Prepare for your real interview with AI-powered practice sessions.
          Practice interviews are not shared with recruiters or companies.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200/50 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-900/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Practice Mode
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              These interviews use the same AI interviewer as real interviews but
              results are only visible to you. Use them to get comfortable with
              the format and improve your responses.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800/30 dark:bg-red-900/10 p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PRACTICE_TYPES.map((practice) => (
          <Card key={practice.type} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{practice.icon}</span>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {practice.duration}
                </Badge>
              </div>
              <CardTitle className="text-lg mt-2">{practice.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <p className="text-sm text-muted-foreground flex-1">
                {practice.description}
              </p>
              <Button
                className="w-full mt-4"
                onClick={() => handleStartPractice(practice.type)}
                disabled={starting !== null}
              >
                {starting === practice.type ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Practice
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">What to expect</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex items-start gap-2">
            <Mic className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Text-based conversation with our AI interviewer
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Video className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              No recording or proctoring in practice mode
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Get a feedback report with strengths after completion
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

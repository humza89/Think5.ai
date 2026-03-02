"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  KanbanSquare,
  GripVertical,
  User,
  Briefcase,
  TrendingUp,
  RefreshCw,
  Inbox,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Candidate {
  id: string;
  fullName: string;
  currentTitle?: string;
  currentCompany?: string;
  status: string;
  skills: string[];
  matchScore?: number;
}

type PipelineStage = "sourced" | "contacted" | "interviewed" | "offered" | "hired";

interface PipelineColumn {
  key: PipelineStage;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "sourced",
    label: "Sourced",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  {
    key: "contacted",
    label: "Contacted",
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  {
    key: "interviewed",
    label: "Interviewed",
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  {
    key: "offered",
    label: "Offered",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/40",
    borderColor: "border-cyan-200 dark:border-cyan-800",
  },
  {
    key: "hired",
    label: "Hired",
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/40",
    borderColor: "border-green-200 dark:border-green-800",
  },
];

// Map API status values to pipeline stages
function mapStatusToStage(status: string): PipelineStage {
  const normalized = status.toLowerCase().replace(/[_\s-]/g, "");
  if (normalized.includes("hired") || normalized.includes("placed")) return "hired";
  if (normalized.includes("offer")) return "offered";
  if (normalized.includes("interview")) return "interviewed";
  if (normalized.includes("contact") || normalized.includes("reached") || normalized.includes("engaged")) return "contacted";
  return "sourced";
}

function getMatchScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 bg-green-50 dark:bg-green-950/40";
  if (score >= 60) return "text-amber-600 bg-amber-50 dark:bg-amber-950/40";
  return "text-red-500 bg-red-50 dark:bg-red-950/40";
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, colIdx) => (
          <div key={colIdx} className="space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <Skeleton key={cardIdx} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates");
      if (!res.ok) throw new Error(`Failed to fetch candidates (${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.candidates ?? [];
      setCandidates(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load pipeline data";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Group candidates by pipeline stage
  const grouped: Record<PipelineStage, Candidate[]> = {
    sourced: [],
    contacted: [],
    interviewed: [],
    offered: [],
    hired: [],
  };

  candidates.forEach((c) => {
    const stage = mapStatusToStage(c.status);
    grouped[stage].push(c);
  });

  if (loading) return <PipelineSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <KanbanSquare className="h-6 w-6" />
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual candidate pipeline management
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCandidates} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!error && candidates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No candidates yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
              Start adding candidates to see them in your pipeline. Import from LinkedIn, upload
              resumes, or add them manually.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Kanban board */}
      {!error && candidates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 min-h-[60vh]">
          {PIPELINE_COLUMNS.map((col) => {
            const items = grouped[col.key];
            return (
              <div key={col.key} className="flex flex-col">
                {/* Column header */}
                <div
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg border mb-3",
                    col.bgColor,
                    col.borderColor
                  )}
                >
                  <span className={cn("text-sm font-semibold", col.color)}>
                    {col.label}
                  </span>
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {items.length}
                  </Badge>
                </div>

                {/* Column cards */}
                <div className="flex-1 space-y-2">
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border">
                      <p className="text-xs text-muted-foreground">No candidates</p>
                    </div>
                  )}
                  {items.map((candidate) => (
                    <Card
                      key={candidate.id}
                      className="group cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-3">
                        {/* Drag indicator */}
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <p className="text-sm font-medium text-foreground truncate">
                                {candidate.fullName}
                              </p>
                            </div>
                            {candidate.currentTitle && (
                              <div className="flex items-center gap-1 mt-1.5 ml-9">
                                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                                <p className="text-xs text-muted-foreground truncate">
                                  {candidate.currentTitle}
                                </p>
                              </div>
                            )}
                            {candidate.matchScore != null && candidate.matchScore > 0 && (
                              <div className="flex items-center gap-1 mt-1.5 ml-9">
                                <TrendingUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0",
                                    getMatchScoreColor(candidate.matchScore)
                                  )}
                                >
                                  {candidate.matchScore}% match
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

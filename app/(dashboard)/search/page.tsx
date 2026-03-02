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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Search,
  SlidersHorizontal,
  User,
  Briefcase,
  MapPin,
  TrendingUp,
  X,
  Inbox,
  Loader2,
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
  location?: string;
  experienceYears?: number;
  matchScore?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "sourced", label: "Sourced" },
  { value: "contacted", label: "Contacted" },
  { value: "interviewed", label: "Interviewed" },
  { value: "offered", label: "Offered" },
  { value: "hired", label: "Hired" },
];

const EXPERIENCE_OPTIONS = [
  { value: "all", label: "Any Experience" },
  { value: "0-2", label: "0-2 years" },
  { value: "3-5", label: "3-5 years" },
  { value: "6-10", label: "6-10 years" },
  { value: "10+", label: "10+ years" },
];

const LOCATION_OPTIONS = [
  { value: "all", label: "Any Location" },
  { value: "remote", label: "Remote" },
  { value: "san-francisco", label: "San Francisco" },
  { value: "new-york", label: "New York" },
  { value: "los-angeles", label: "Los Angeles" },
  { value: "seattle", label: "Seattle" },
  { value: "austin", label: "Austin" },
  { value: "chicago", label: "Chicago" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMatchScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 bg-green-50 dark:bg-green-950/40";
  if (score >= 60) return "text-amber-600 bg-amber-50 dark:bg-amber-950/40";
  return "text-red-500 bg-red-50 dark:bg-red-950/40";
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function SearchSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCandidates = useCallback(
    async (searchQuery: string, status: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        if (status && status !== "all") params.set("status", status);

        const res = await fetch(`/api/candidates?${params.toString()}`);
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.candidates ?? [];
        setCandidates(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to search candidates";
        toast.error(message);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCandidates(query, statusFilter);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, statusFilter, fetchCandidates]);

  // Client-side filtering for experience and location
  const filtered = candidates.filter((c) => {
    if (experienceFilter !== "all" && c.experienceYears != null) {
      if (experienceFilter === "0-2" && c.experienceYears > 2) return false;
      if (experienceFilter === "3-5" && (c.experienceYears < 3 || c.experienceYears > 5)) return false;
      if (experienceFilter === "6-10" && (c.experienceYears < 6 || c.experienceYears > 10)) return false;
      if (experienceFilter === "10+" && c.experienceYears < 10) return false;
    }
    if (locationFilter !== "all" && c.location) {
      const loc = c.location.toLowerCase();
      const filterLoc = locationFilter.replace(/-/g, " ").toLowerCase();
      if (!loc.includes(filterLoc)) return false;
    }
    return true;
  });

  const hasActiveFilters =
    statusFilter !== "all" || experienceFilter !== "all" || locationFilter !== "all";

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setExperienceFilter("all");
    setLocationFilter("all");
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Search className="h-6 w-6" />
          Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find the perfect candidate
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search by name, title, company, or skills..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-12 text-base bg-background"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </div>
            <div className="flex flex-wrap gap-3 flex-1">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      {!initialLoad && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
              </span>
            ) : (
              <>
                {filtered.length} candidate{filtered.length !== 1 ? "s" : ""} found
              </>
            )}
          </p>
        </div>
      )}

      {/* Loading state */}
      {(initialLoad || loading) && <SearchSkeleton />}

      {/* Empty state */}
      {!loading && !initialLoad && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No results found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
              Try adjusting your search query or filters to find more candidates.
            </p>
            {(query || hasActiveFilters) && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results grid */}
      {!loading && !initialLoad && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((candidate) => (
            <Card
              key={candidate.id}
              className="group hover:shadow-md transition-shadow cursor-pointer"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {candidate.fullName}
                    </p>
                    {candidate.currentTitle && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">
                          {candidate.currentTitle}
                          {candidate.currentCompany && ` at ${candidate.currentCompany}`}
                        </p>
                      </div>
                    )}
                    {candidate.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">
                          {candidate.location}
                        </p>
                      </div>
                    )}

                    {/* Skills badges */}
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {candidate.skills.slice(0, 4).map((skill) => (
                          <Badge
                            key={skill}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {skill}
                          </Badge>
                        ))}
                        {candidate.skills.length > 4 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{candidate.skills.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Match score */}
                    {candidate.matchScore != null && candidate.matchScore > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
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
      )}
    </div>
  );
}

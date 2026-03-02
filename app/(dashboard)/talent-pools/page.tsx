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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Plus,
  Users,
  Calendar,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TalentPool {
  id: string;
  name: string;
  description?: string;
  candidateCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TalentPoolsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TalentPoolsPage() {
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolDescription, setNewPoolDescription] = useState("");

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/talent-pools");
      if (!res.ok) throw new Error(`Failed to fetch talent pools (${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.pools ?? [];
      setPools(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load talent pools";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  async function handleCreatePool() {
    if (!newPoolName.trim()) {
      toast.error("Pool name is required");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/talent-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPoolName.trim(),
          description: newPoolDescription.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create pool (${res.status})`);
      const created = await res.json();
      setPools((prev) => [created, ...prev]);
      toast.success("Talent pool created successfully");
      setShowCreateDialog(false);
      setNewPoolName("");
      setNewPoolDescription("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create talent pool";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <TalentPoolsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <FolderKanban className="h-6 w-6" />
            Talent Pools
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize candidates into targeted groups
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create Pool
        </Button>
      </div>

      {/* Empty state */}
      {pools.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No talent pools yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
              Create your first pool to organize candidates into targeted groups for
              efficient recruiting.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Pool
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pool grid */}
      {pools.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((pool) => (
            <Card
              key={pool.id}
              className="group hover:shadow-md transition-shadow cursor-pointer"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground truncate">
                  {pool.name}
                </CardTitle>
                {pool.description && (
                  <CardDescription className="line-clamp-2">
                    {pool.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {pool.candidateCount} candidate{pool.candidateCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{new Date(pool.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create pool dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Talent Pool</DialogTitle>
            <DialogDescription>
              Create a new pool to group and organize candidates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pool-name">Name</Label>
              <Input
                id="pool-name"
                placeholder="e.g. Senior Engineers, Bay Area Designers"
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-description">Description (optional)</Label>
              <Textarea
                id="pool-description"
                placeholder="Describe the purpose of this talent pool..."
                rows={3}
                value={newPoolDescription}
                onChange={(e) => setNewPoolDescription(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreatePool} disabled={creating || !newPoolName.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

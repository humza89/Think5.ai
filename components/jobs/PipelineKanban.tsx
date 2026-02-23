"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";
import { KanbanCard, type KanbanApplication } from "./KanbanCard";

const PIPELINE_STAGES = [
  { id: "APPLIED", label: "Applied", color: "bg-blue-500" },
  { id: "SCREENING", label: "Screening", color: "bg-yellow-500" },
  { id: "INTERVIEWING", label: "Interviewing", color: "bg-purple-500" },
  { id: "SHORTLISTED", label: "Shortlisted", color: "bg-cyan-500" },
  { id: "OFFERED", label: "Offered", color: "bg-orange-500" },
  { id: "HIRED", label: "Hired", color: "bg-green-500" },
] as const;

const ARCHIVED_STAGES = [
  { id: "REJECTED", label: "Rejected", color: "bg-red-500" },
  { id: "WITHDRAWN", label: "Withdrawn", color: "bg-gray-500" },
] as const;

const ALL_VALID_STATUSES = [
  ...PIPELINE_STAGES.map((s) => s.id),
  ...ARCHIVED_STAGES.map((s) => s.id),
];

interface PipelineKanbanProps {
  jobId: string;
  applications: KanbanApplication[];
}

// ─── Droppable Column Wrapper ────────────────────────────────────────────────

function DroppableColumn({
  stageId,
  label,
  color,
  count,
  children,
}: {
  stageId: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${stageId}`,
    data: { type: "column", stageId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border bg-gray-50/80 min-w-[280px] w-[280px]
        flex-shrink-0 transition-colors duration-150
        ${isOver ? "bg-blue-50/60 border-blue-200" : "border-gray-200"}
      `}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200/60">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <Badge
          variant="secondary"
          className="text-[11px] px-1.5 py-0 min-w-[20px] justify-center bg-gray-200/80 text-gray-600"
        >
          {count}
        </Badge>
      </div>

      {/* Card List */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-340px)] min-h-[120px]">
        {children}
        {count === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Users className="h-5 w-5 mb-1 opacity-50" />
            <span className="text-xs">No candidates</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Pipeline Kanban ────────────────────────────────────────────────────

export function PipelineKanban({ jobId, applications }: PipelineKanbanProps) {
  const [items, setItems] = useState<KanbanApplication[]>(applications);
  const [activeCard, setActiveCard] = useState<KanbanApplication | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // Group applications by status
  const grouped = useMemo(() => {
    const map: Record<string, KanbanApplication[]> = {};
    for (const stage of PIPELINE_STAGES) {
      map[stage.id] = [];
    }
    for (const stage of ARCHIVED_STAGES) {
      map[stage.id] = [];
    }
    for (const app of items) {
      if (map[app.status]) {
        map[app.status].push(app);
      } else {
        // Fallback: put unknown statuses in APPLIED
        map["APPLIED"].push(app);
      }
    }
    return map;
  }, [items]);

  const archivedCount = useMemo(
    () =>
      ARCHIVED_STAGES.reduce(
        (sum, stage) => sum + (grouped[stage.id]?.length || 0),
        0
      ),
    [grouped]
  );

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  // Find which column an application is in
  const findContainer = useCallback(
    (id: string): string | null => {
      // Check if it's a column ID
      if (id.startsWith("column-")) {
        return id.replace("column-", "");
      }
      // Otherwise find which column the application belongs to
      for (const [stageId, apps] of Object.entries(grouped)) {
        if (apps.some((app) => app.id === id)) {
          return stageId;
        }
      }
      return null;
    },
    [grouped]
  );

  // Drag handlers
  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const app = items.find((a) => a.id === active.id);
    if (app) {
      setActiveCard(app);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContainer = findContainer(activeId);
    let overContainer = findContainer(overId);

    // If dropping onto a column directly
    if (overId.startsWith("column-")) {
      overContainer = overId.replace("column-", "");
    }

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    // Move the item to the new container optimistically
    setItems((prev) =>
      prev.map((app) =>
        app.id === activeId ? { ...app, status: overContainer! } : app
      )
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine the target column
    let targetStatus: string | null = null;
    if (overId.startsWith("column-")) {
      targetStatus = overId.replace("column-", "");
    } else {
      targetStatus = findContainer(overId);
    }

    if (!targetStatus || !(ALL_VALID_STATUSES as readonly string[]).includes(targetStatus)) return;

    const app = items.find((a) => a.id === activeId);
    if (!app) return;

    // Find the original status from the initial applications prop
    const originalApp = applications.find((a) => a.id === activeId);
    const currentServerStatus = originalApp?.status;

    // If the status hasn't changed from the server state, nothing to do
    if (targetStatus === currentServerStatus) {
      // Reset optimistic update if needed
      setItems((prev) =>
        prev.map((a) =>
          a.id === activeId ? { ...a, status: currentServerStatus! } : a
        )
      );
      return;
    }

    // Optimistic update already happened in handleDragOver, but ensure it's correct
    setItems((prev) =>
      prev.map((a) =>
        a.id === activeId ? { ...a, status: targetStatus! } : a
      )
    );

    // Persist to server
    try {
      const res = await fetch(`/api/jobs/${jobId}/applications/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }

      toast.success(
        `Moved ${app.candidate.fullName} to ${
          PIPELINE_STAGES.find((s) => s.id === targetStatus)?.label ||
          ARCHIVED_STAGES.find((s) => s.id === targetStatus)?.label ||
          targetStatus
        }`
      );
    } catch (error: any) {
      // Revert optimistic update
      setItems((prev) =>
        prev.map((a) =>
          a.id === activeId
            ? { ...a, status: currentServerStatus || "APPLIED" }
            : a
        )
      );
      toast.error(error.message || "Failed to move candidate");
    }
  }

  return (
    <div className="space-y-4">
      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Main Pipeline Columns */}
        <div className="overflow-x-auto pb-4 -mx-2 px-2 snap-x">
          <div className="flex gap-3 min-w-max">
            {PIPELINE_STAGES.map((stage) => {
              const stageApps = grouped[stage.id] || [];
              return (
                <DroppableColumn
                  key={stage.id}
                  stageId={stage.id}
                  label={stage.label}
                  color={stage.color}
                  count={stageApps.length}
                >
                  <SortableContext
                    items={stageApps.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {stageApps.map((app) => (
                      <KanbanCard key={app.id} application={app} />
                    ))}
                  </SortableContext>
                </DroppableColumn>
              );
            })}
          </div>
        </div>

        {/* Archived / Rejected / Withdrawn */}
        {archivedCount > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setArchivedExpanded(!archivedExpanded)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
            >
              {archivedExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">Archived</span>
              <Badge
                variant="secondary"
                className="text-[11px] px-1.5 py-0 bg-gray-200/80 text-gray-500"
              >
                {archivedCount}
              </Badge>
            </button>

            {archivedExpanded && (
              <div className="overflow-x-auto pb-4 -mx-2 px-2">
                <div className="flex gap-3 min-w-max">
                  {ARCHIVED_STAGES.map((stage) => {
                    const stageApps = grouped[stage.id] || [];
                    if (stageApps.length === 0) return null;
                    return (
                      <DroppableColumn
                        key={stage.id}
                        stageId={stage.id}
                        label={stage.label}
                        color={stage.color}
                        count={stageApps.length}
                      >
                        <SortableContext
                          items={stageApps.map((a) => a.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stageApps.map((app) => (
                            <KanbanCard key={app.id} application={app} />
                          ))}
                        </SortableContext>
                      </DroppableColumn>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeCard ? (
            <KanbanCard application={activeCard} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Users className="h-12 w-12 mb-3 opacity-40" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No applications yet
          </h3>
          <p className="text-sm text-gray-500">
            Applications will appear here as candidates apply
          </p>
        </div>
      )}
    </div>
  );
}

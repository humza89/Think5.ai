"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, User } from "lucide-react";

export interface KanbanApplication {
  id: string;
  status: string;
  appliedAt: string;
  candidate: {
    id: string;
    fullName: string;
    currentTitle: string | null;
    currentCompany: string | null;
    profileImage: string | null;
    ariaOverallScore: number | null;
  };
}

interface KanbanCardProps {
  application: KanbanApplication;
  overlay?: boolean;
}

export function KanbanCard({ application, overlay }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: {
      type: "application",
      application,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const appliedDate = new Date(application.appliedAt).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  );

  const initials = application.candidate.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative rounded-lg border bg-white p-3 shadow-sm
        transition-all duration-150
        ${isDragging ? "opacity-40 shadow-lg ring-2 ring-blue-300" : ""}
        ${overlay ? "shadow-xl ring-2 ring-blue-400 rotate-[2deg]" : ""}
        ${!isDragging && !overlay ? "hover:shadow-md hover:border-gray-300" : ""}
      `}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          className="mt-0.5 flex-shrink-0 cursor-grab rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${application.candidate.fullName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Card Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {/* Avatar */}
            {application.candidate.profileImage ? (
              <img
                src={application.candidate.profileImage}
                alt={application.candidate.fullName}
                className="h-7 w-7 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-semibold text-gray-500">
                  {initials}
                </span>
              </div>
            )}

            {/* Name */}
            <Link
              href={`/candidates/${application.candidate.id}`}
              className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {application.candidate.fullName}
            </Link>
          </div>

          {/* Title */}
          {application.candidate.currentTitle && (
            <p className="text-xs text-gray-500 truncate mb-1.5 pl-9">
              {application.candidate.currentTitle}
              {application.candidate.currentCompany &&
                ` at ${application.candidate.currentCompany}`}
            </p>
          )}

          {/* Footer: date + score */}
          <div className="flex items-center justify-between pl-9">
            <span className="text-[11px] text-gray-400">{appliedDate}</span>
            {application.candidate.ariaOverallScore != null && (
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  application.candidate.ariaOverallScore >= 70
                    ? "bg-green-50 text-green-700"
                    : application.candidate.ariaOverallScore >= 40
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {Math.round(application.candidate.ariaOverallScore)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

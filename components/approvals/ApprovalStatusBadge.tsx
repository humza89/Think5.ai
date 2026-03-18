"use client"

import { Badge } from "@/components/ui/badge"

const statusConfig: Record<string, { label: string; className: string }> = {
  INVITED: {
    label: "Invited",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
  },
  PROFILE_STARTED: {
    label: "In Progress",
    className: "bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-900/30 dark:text-slate-400",
  },
  PROFILE_COMPLETED: {
    label: "Profile Complete",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
  },
  PENDING_APPROVAL: {
    label: "Pending Review",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

const DEFAULT_CONFIG = {
  label: "Unknown",
  className: "bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400",
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || DEFAULT_CONFIG
  return <Badge className={config.className}>{config.label}</Badge>
}

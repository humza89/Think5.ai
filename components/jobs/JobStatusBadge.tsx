"use client";

import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-green-100 text-green-700 hover:bg-green-100",
  },
  PAUSED: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  },
  CLOSED: {
    label: "Closed",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
  FILLED: {
    label: "Filled",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.DRAFT;
  return <Badge className={config.className}>{config.label}</Badge>;
}

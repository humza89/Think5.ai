"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode
  content: string
  side?: "top" | "bottom" | "left" | "right"
}

function Tooltip({ children, content, side = "top" }: TooltipProps) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div
        role="tooltip"
        className={cn(
          "absolute z-50 hidden group-hover:block px-3 py-1.5 text-xs font-medium text-popover-foreground bg-popover border rounded-md shadow-md whitespace-nowrap",
          side === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-2",
          side === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-2",
          side === "left" && "right-full top-1/2 -translate-y-1/2 mr-2",
          side === "right" && "left-full top-1/2 -translate-y-1/2 ml-2"
        )}
      >
        {content}
      </div>
    </div>
  )
}

export { Tooltip }

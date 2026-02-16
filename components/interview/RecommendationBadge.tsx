"use client";

import { Badge } from "@/components/ui/badge";

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  STRONG_YES: { bg: "bg-green-100", text: "text-green-800", label: "Strong Yes" },
  YES: { bg: "bg-blue-100", text: "text-blue-800", label: "Yes" },
  MAYBE: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Maybe" },
  NO: { bg: "bg-orange-100", text: "text-orange-800", label: "No" },
  STRONG_NO: { bg: "bg-red-100", text: "text-red-800", label: "Strong No" },
};

interface RecommendationBadgeProps {
  recommendation: string;
  size?: "sm" | "lg";
}

export function RecommendationBadge({
  recommendation,
  size = "sm",
}: RecommendationBadgeProps) {
  const style = STYLES[recommendation] || STYLES.MAYBE;

  return (
    <Badge
      className={`${style.bg} ${style.text} border-0 ${
        size === "lg" ? "text-base px-4 py-1.5" : ""
      }`}
    >
      {style.label}
    </Badge>
  );
}

"use client";

/**
 * NetworkQualityIndicator — Visual network quality display
 *
 * Shows signal bars (1-3) with color coding based on RTT:
 * - Green (<200ms): good
 * - Yellow (200-500ms): fair
 * - Red (>500ms): poor
 */

import { Wifi, WifiOff } from "lucide-react";

interface NetworkQualityIndicatorProps {
  quality: "good" | "fair" | "poor";
  rttMs?: number;
  className?: string;
}

export function NetworkQualityIndicator({
  quality,
  rttMs,
  className = "",
}: NetworkQualityIndicatorProps) {
  const colorMap = {
    good: "text-green-500",
    fair: "text-amber-500",
    poor: "text-red-500",
  };

  const barCountMap = {
    good: 3,
    fair: 2,
    poor: 1,
  };

  const labelMap = {
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  };

  const color = colorMap[quality];
  const bars = barCountMap[quality];

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      title={`Connection: ${labelMap[quality]}${rttMs ? ` (${rttMs}ms)` : ""}`}
      role="status"
      aria-label={`Network quality: ${labelMap[quality]}${rttMs ? `, ${rttMs} milliseconds latency` : ""}`}
    >
      {quality === "poor" ? (
        <WifiOff className={`w-4 h-4 ${color}`} />
      ) : (
        <Wifi className={`w-4 h-4 ${color}`} />
      )}

      {/* Signal bars */}
      <div className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={`w-1 rounded-sm transition-colors ${
              bar <= bars
                ? quality === "good"
                  ? "bg-green-500"
                  : quality === "fair"
                    ? "bg-amber-500"
                    : "bg-red-500"
                : "bg-zinc-700"
            }`}
            style={{ height: `${bar * 4 + 2}px` }}
          />
        ))}
      </div>

      {rttMs !== undefined && (
        <span className={`text-xs font-mono ${color}`}>
          {rttMs}ms
        </span>
      )}
    </div>
  );
}

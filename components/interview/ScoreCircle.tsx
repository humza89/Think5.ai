"use client";

interface ScoreCircleProps {
  score: number;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZES = {
  sm: { width: 48, stroke: 3, fontSize: "text-sm", radius: 18 },
  md: { width: 80, stroke: 4, fontSize: "text-xl", radius: 32 },
  lg: { width: 120, stroke: 5, fontSize: "text-3xl", radius: 50 },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green
  if (score >= 60) return "#3b82f6"; // blue
  if (score >= 40) return "#eab308"; // yellow
  return "#ef4444"; // red
}

export function ScoreCircle({ score, size = "md", label }: ScoreCircleProps) {
  const config = SIZES[size];
  const circumference = 2 * Math.PI * config.radius;
  const progress = ((score || 0) / 100) * circumference;
  const color = getScoreColor(score);
  const center = config.width / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        <svg
          width={config.width}
          height={config.width}
          viewBox={`0 0 ${config.width} ${config.width}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={config.stroke}
          />
          {/* Progress circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            stroke={color}
            strokeWidth={config.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${config.fontSize}`} style={{ color }}>
            {score ?? "—"}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      )}
    </div>
  );
}

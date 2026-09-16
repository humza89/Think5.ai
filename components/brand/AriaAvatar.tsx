import { cn } from "@/lib/utils";

interface AriaAvatarProps {
  /** Rendered size in px. */
  size?: number;
  /** Animate the listening pulse and ring rotation. */
  live?: boolean;
  className?: string;
}

/**
 * Aria, Think5's AI interviewer. An abstract "presence" rather than a face:
 * a brand-blue core inside layered instrument rings, with a listening pulse.
 */
export function AriaAvatar({ size = 64, live = true, className }: AriaAvatarProps) {
  const id = "aria-" + size; // stable per size; multiple instances share defs safely
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }} aria-label="Aria, AI interviewer" role="img">
      <svg viewBox="0 0 120 120" width={size} height={size} className="block">
        <defs>
          <radialGradient id={`${id}-core`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#8fa0ff" />
            <stop offset="45%" stopColor="#1f3dff" />
            <stop offset="100%" stopColor="#060a33" />
          </radialGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#1f3dff" stopOpacity="0" />
            <stop offset="100%" stopColor="#1f3dff" stopOpacity="0.45" />
          </radialGradient>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Outer glow */}
        <circle cx="60" cy="60" r="58" fill={`url(#${id}-glow)`} className={live ? "aria-breathe" : undefined} />

        {/* Instrument rings */}
        <g className={live ? "aria-spin-slow" : undefined} style={{ transformOrigin: "60px 60px" }}>
          <circle cx="60" cy="60" r="52" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.5" strokeDasharray="40 287" />
        </g>
        <g className={live ? "aria-spin-rev" : undefined} style={{ transformOrigin: "60px 60px" }}>
          <circle cx="60" cy="60" r="44" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
          <circle cx="60" cy="60" r="44" fill="none" stroke="#1f3dff" strokeWidth="2" strokeDasharray="18 258" strokeLinecap="round" />
          <circle cx="60" cy="60" r="44" fill="none" stroke="#8fa0ff" strokeWidth="2" strokeDasharray="6 270" strokeDashoffset="-120" strokeLinecap="round" />
        </g>

        {/* Core */}
        <circle cx="60" cy="60" r="30" fill={`url(#${id}-core)`} />
        <circle cx="60" cy="60" r="30" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />

        {/* Iris: three arcs that read as focus */}
        <g fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round">
          <path d="M45 60a15 15 0 0 1 15-15" strokeOpacity="0.9" />
          <path d="M75 60a15 15 0 0 1-15 15" strokeOpacity="0.5" />
        </g>
        <circle cx="60" cy="60" r="4.5" fill="#ffffff" className={live ? "aria-pulse" : undefined} style={{ transformOrigin: "60px 60px" }} />

        {/* Specular highlight */}
        <ellipse cx="50" cy="47" rx="7" ry="4" fill="#ffffff" fillOpacity="0.35" transform="rotate(-30 50 47)" />
      </svg>

      {live && (
        <style>{`
          @keyframes aria-spin { to { transform: rotate(360deg); } }
          @keyframes aria-spin-rev { to { transform: rotate(-360deg); } }
          @keyframes aria-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.7; } }
          @keyframes aria-breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
          .aria-spin-slow { animation: aria-spin 14s linear infinite; }
          .aria-spin-rev { animation: aria-spin-rev 9s linear infinite; }
          .aria-pulse { animation: aria-pulse 1.8s ease-in-out infinite; }
          .aria-breathe { animation: aria-breathe 3.2s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .aria-spin-slow, .aria-spin-rev, .aria-pulse, .aria-breathe { animation: none; }
          }
        `}</style>
      )}
    </span>
  );
}

export default AriaAvatar;

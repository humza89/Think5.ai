import { cn } from "@/lib/utils";

type Tone = "dark" | "light";

interface LogoMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  /** "dark" = ink tile for light backgrounds, "light" = paper tile for dark backgrounds. */
  tone?: Tone;
  className?: string;
}

/**
 * Think5 mark: a rounded ink tile with a bold geometric lowercase "t" and the
 * brand dot resting at its baseline — the same period that closes the wordmark.
 */
export function LogoMark({ size = 32, tone = "dark", className }: LogoMarkProps) {
  const tile = tone === "dark" ? "var(--ink)" : "var(--paper-2)";
  const glyph = tone === "dark" ? "var(--paper)" : "var(--ink)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" fill={tile} />
      {/* t: stem with a hooked foot, plus crossbar */}
      <path d="M29.5 11V40.5A10.5 10.5 0 0 0 40 51h2.5" stroke={glyph} strokeWidth="9" strokeLinecap="butt" strokeLinejoin="miter" />
      <path d="M17 26.5H42" stroke={glyph} strokeWidth="9" strokeLinecap="butt" />
      <circle cx="50.5" cy="46.5" r="5.5" fill="var(--brand)" />
    </svg>
  );
}

export default LogoMark;

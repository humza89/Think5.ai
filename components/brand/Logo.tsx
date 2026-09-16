import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";

type Tone = "dark" | "light";

interface LogoProps {
  /** "dark" = ink text for light backgrounds, "light" = white text for dark backgrounds. */
  tone?: Tone;
  /** Show the square mark before the wordmark. */
  withMark?: boolean;
  /** Wrap in a link to "/" (default true). */
  href?: string | null;
  className?: string;
}

/**
 * Think5 wordmark: lowercase geometric "think5" with the brand-blue period.
 */
export function Logo({ tone = "dark", withMark = false, href = "/", className }: LogoProps) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        tone === "dark" ? "text-ink" : "text-white",
        className
      )}
      aria-label="Think5"
    >
      {withMark && <LogoMark size={28} tone={tone} />}
      <span className="font-sans text-[22px] font-semibold leading-none tracking-[-0.045em]">
        think5
        <span className="text-brand">.</span>
      </span>
    </span>
  );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm">
      {content}
    </Link>
  );
}

export default Logo;

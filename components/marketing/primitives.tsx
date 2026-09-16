"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "light" | "dark";

/* ── Layout ─────────────────────────────────────────────────────────── */

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-6 md:px-10", className)}>{children}</div>;
}

export function Hairline({ className, tone = "light" }: { className?: string; tone?: Tone }) {
  return <div className={cn("h-px w-full", tone === "light" ? "bg-stone" : "bg-white/10", className)} />;
}

/* ── Type ───────────────────────────────────────────────────────────── */

export function Eyebrow({ children, tone = "light", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em]",
        tone === "light" ? "text-graphite" : "text-white/55",
        className
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
      {children}
    </p>
  );
}

interface SectionTitleProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  tone?: Tone;
  className?: string;
  /** Tailwind size override for the h2 */
  size?: "md" | "lg";
}

export function SectionTitle({ eyebrow, title, lede, align = "left", tone = "light", className, size = "md" }: SectionTitleProps) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <Eyebrow tone={tone} className="mb-5">{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          "font-display font-normal tracking-[-0.02em]",
          size === "md" ? "text-[40px] leading-[1.05] md:text-[56px]" : "text-[48px] leading-[1.02] md:text-[72px]",
          tone === "light" ? "text-ink" : "text-white"
        )}
      >
        {title}
      </h2>
      {lede && (
        <p className={cn("mt-6 max-w-2xl text-[17px] leading-relaxed md:text-lg", align === "center" && "mx-auto", tone === "light" ? "text-graphite" : "text-white/60")}>
          {lede}
        </p>
      )}
    </div>
  );
}

/* ── Stats ──────────────────────────────────────────────────────────── */

export interface Stat {
  value: string;
  label: string;
}

export function StatRow({ stats, tone = "light", className }: { stats: Stat[]; tone?: Tone; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4", className)}>
      {stats.map((s) => (
        <div key={s.label} className={cn("border-t pt-5", tone === "light" ? "border-stone" : "border-white/10")}>
          <dd className={cn("font-display text-[44px] leading-none tracking-[-0.02em] md:text-[56px]", tone === "light" ? "text-ink" : "text-white")}>
            {s.value}
          </dd>
          <dt className={cn("mt-3 text-[13px] uppercase tracking-[0.12em]", tone === "light" ? "text-graphite" : "text-white/50")}>{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────── */

export const pill = {
  ink: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
  paper: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
  ghostLight: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone bg-transparent px-6 text-[15px] font-medium text-ink transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  ghostDark: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-transparent px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  brand: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#1732d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
};

/* ── Scroll reveal ──────────────────────────────────────────────────── */

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** ms delay before the reveal transition starts */
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}

/** Fades content up once when it enters the viewport. Content is fully visible without JS. */
export function Reveal({ children, className, delay = 0, as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={cn("reveal", className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}

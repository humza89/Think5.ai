"use client";

import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

/**
 * Brand marks are the CC0 Simple Icons set (public/brand-marks/*.svg), rendered as
 * CSS masks so every mark shares one height and one colour.
 */
const LOGOS = [
  { name: "OpenAI", file: "openai" },
  { name: "Anthropic", file: "anthropic" },
  { name: "Google", file: "google" },
  { name: "Meta", file: "meta" },
  { name: "Microsoft", file: "microsoft" },
  { name: "NVIDIA", file: "nvidia" },
  { name: "Netflix", file: "netflix" },
  { name: "Hugging Face", file: "huggingface" },
  { name: "Mistral AI", file: "mistralai" },
];

interface LogoWallProps {
  tone?: "dark" | "light";
  label?: string;
}

export function LogoWall({ tone = "dark", label = "Trusted by teams building frontier AI" }: LogoWallProps) {
  const dark = tone === "dark";
  return (
    <section className={cn("relative py-14", dark ? "bg-ink" : "bg-paper")} aria-label="Customer logos">
      <p className={cn("mb-8 text-center text-[11px] font-medium uppercase tracking-[0.18em]", dark ? "text-white/40" : "text-graphite")}>
        {label}
      </p>
      <div className="relative">
        <div className={cn("pointer-events-none absolute inset-y-0 left-0 z-10 w-24 md:w-48", dark ? "bg-gradient-to-r from-ink to-transparent" : "bg-gradient-to-r from-paper to-transparent")} />
        <div className={cn("pointer-events-none absolute inset-y-0 right-0 z-10 w-24 md:w-48", dark ? "bg-gradient-to-l from-ink to-transparent" : "bg-gradient-to-l from-paper to-transparent")} />
        <Marquee pauseOnHover className="[--duration:45s] [--gap:1rem] p-0">
          {LOGOS.map((logo) => (
            <div
              key={logo.name}
              className={cn(
                "flex h-16 w-48 shrink-0 items-center justify-center gap-3 rounded-xl border transition-colors",
                dark ? "border-white/10 bg-white/[0.03] text-white/70 hover:text-white" : "border-stone bg-paper-2 text-ink/70 hover:text-ink"
              )}
              title={logo.name}
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 shrink-0 bg-current"
                style={{
                  maskImage: `url(/brand-marks/${logo.file}.svg)`,
                  WebkitMaskImage: `url(/brand-marks/${logo.file}.svg)`,
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                }}
              />
              <span className="text-[15px] font-medium tracking-[-0.01em]">{logo.name}</span>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

export default LogoWall;

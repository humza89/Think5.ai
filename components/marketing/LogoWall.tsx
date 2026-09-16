"use client";

import Image from "next/image";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

const LOGOS = [
  { name: "OpenAI", src: "/Logos/openai-logo-0.png" },
  { name: "Anthropic", src: "/Logos/anthropic-logo.webp" },
  { name: "Google DeepMind", src: "/Logos/google-deepmind-logo.png" },
  { name: "Meta", src: "/Logos/png-clipart-meta-horizontal-logo-social-media-icons.png" },
  { name: "Microsoft", src: "/Logos/png-clipart-microsoft-logo-company-microsoft-company-text-thumbnail.png" },
  { name: "Netflix", src: "/Logos/png-clipart-netflix-logo-illustration-netflix-streaming-media-television-show-logo-netflix-logo-television-text.png" },
  { name: "Cohere", src: "/Logos/Cohere_Logo_2023.png" },
  { name: "Stability AI", src: "/Logos/stability-ai-tojrcvgxoppi2i0h4fggv.webp" },
  { name: "Runway", src: "/Logos/Runway_Logo.png" },
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
                "flex h-20 w-44 shrink-0 items-center justify-center rounded-xl border",
                dark ? "border-white/10 bg-white/[0.03]" : "border-stone bg-paper-2"
              )}
            >
              <Image
                src={logo.src}
                alt={logo.name}
                width={120}
                height={40}
                className={cn("h-7 w-auto object-contain opacity-70 transition-opacity hover:opacity-100", dark ? "invert grayscale" : "grayscale")}
                unoptimized
              />
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

export default LogoWall;

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface TeamPortraitProps {
  /** File slug: looks for /team/<slug>.jpg; falls back to a generated portrait. */
  slug: string;
  name: string;
  /** Deterministic 0–360 hue seed so every fallback differs but shares one theme. */
  seed: number;
  className?: string;
}

/**
 * Team headshot with a brand-styled generated fallback. Drop a 4:5 image at
 * public/team/<slug>.jpg and it replaces the fallback automatically.
 */
export function TeamPortrait({ slug, name, seed, className }: TeamPortraitProps) {
  const [missing, setMissing] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className={cn("relative aspect-[4/5] w-full overflow-hidden rounded-[20px] border border-stone bg-[#ece9e1]", className)}>
      {!missing ? (
        <img
          src={`/team/${slug}.jpg`}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setMissing(true)}
        />
      ) : (
        <Generated initials={initials} seed={seed} />
      )}
    </div>
  );
}

/** Abstract studio portrait: warm paper room, blue key light, serif monogram. */
function Generated({ initials, seed }: { initials: string; seed: number }) {
  const x = 30 + (seed % 40); // key-light position varies per person
  const y = 25 + ((seed * 7) % 30);
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(55% 45% at ${x}% ${y}%, rgba(31,61,255,0.28) 0%, rgba(31,61,255,0) 70%), linear-gradient(180deg, #f3f1ea 0%, #e2ded4 100%)`,
        }}
      />
      <div className="dot-grid-light absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      {/* Shoulders silhouette */}
      <div className="absolute -bottom-[18%] left-1/2 h-[55%] w-[110%] -translate-x-1/2 rounded-[50%] bg-ink/90" />
      {/* Head */}
      <div className="absolute left-1/2 top-[22%] h-[34%] w-[42%] -translate-x-1/2 rounded-[46%] bg-ink" />
      <span className="absolute inset-x-0 top-[33%] text-center font-display text-[28px] text-paper">{initials}</span>
    </div>
  );
}

export default TeamPortrait;

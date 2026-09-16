"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { AriaPortrait } from "@/components/brand/AriaPortrait";
import { cn } from "@/lib/utils";

/* ── Geometry ──────────────────────────────────────────────────────────
 * The hero video (3840×2876) contains a dark screen. Its bounds, as
 * fractions of the video frame, were measured from the footage. The console
 * is pinned to that rectangle on every viewport by reproducing the video's
 * object-fit: cover / object-position: center top maths.
 */
const VIDEO_W = 3840;
const VIDEO_H = 2876;
const SCREEN = { x: 0.185, y: 0.507, w: 0.535, h: 0.37 }; // right edge at 72.0%, just inside the bezel glow
/** Fixed design canvas; the whole console scales to the screen rectangle. */
const DESIGN_W = 1040;
const DESIGN_H = 540; // 1040 / 540 matches the screen rectangle's aspect

/* ── Content ───────────────────────────────────────────────────────────── */
const STAGES = [
  { label: "Sourced", target: 1284 },
  { label: "Aria-screened", target: 412 },
  { label: "Shortlisted", target: 9 },
  { label: "Offers", target: 1 },
];

const SHORTLIST = [
  { initials: "PN", name: "Priya Nair", headline: "Staff engineer · ex-Stripe", aria: 94, fit: 96, status: "Interviewing" },
  { initials: "DK", name: "Daniel Kim", headline: "Senior backend · fintech", aria: 91, fit: 93, status: "Shortlisted" },
  { initials: "AO", name: "Amara Okafor", headline: "Platform lead · payments", aria: 89, fit: 90, status: "Shortlisted" },
  { initials: "LM", name: "Lucas Meyer", headline: "Backend · distributed systems", aria: 87, fit: 88, status: "Reference check" },
  { initials: "SR", name: "Sofia Rossi", headline: "Senior engineer · marketplaces", aria: 85, fit: 86, status: "Shortlisted" },
];

const FEED = [
  { text: "Aria scored Daniel Kim 91 · system design", when: "just now" },
  { text: "Reference check complete · Lucas Meyer", when: "2m" },
  { text: "Nexus matched 3 new candidates · Berlin", when: "6m" },
  { text: "Offer drafted · Priya Nair · $215k + equity", when: "14m" },
  { text: "Aria interview booked · Amara Okafor · Thu 10:00", when: "22m" },
  { text: "Licence verified · 2 candidates · Healthcare pool", when: "31m" },
];

const BARS = [5, 12, 18, 9, 21, 14, 7, 17, 12, 6, 19, 10, 15, 8];

export function HeroConsole() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const update = () => {
      const W = host.clientWidth;
      const H = host.clientHeight;
      const s = Math.max(W / VIDEO_W, H / VIDEO_H); // object-fit: cover
      const rw = VIDEO_W * s;
      const rh = VIDEO_H * s;
      const ox = (W - rw) / 2; // object-position: center …
      const oy = 0; // … top
      setBox({ left: ox + SCREEN.x * rw, top: oy + SCREEN.y * rh, width: SCREEN.w * rw, height: SCREEN.h * rh });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const scale = box ? box.width / DESIGN_W : 0;

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-0 hidden md:block"
      style={box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { display: "none" }}
      aria-hidden="true"
    >
      <div
        className="hero-console overflow-hidden rounded-[6px] bg-paper text-ink"
        style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <Console />
      </div>
    </div>
  );
}

function Console() {
  return (
    <div className="flex h-full flex-col">
      {/* Title bar */}
      <div className="flex h-12 items-center gap-3 border-b border-stone bg-paper-2 px-5">
        <LogoMark size={22} />
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">Recruiting</span>
          <span className="text-[12px] text-graphite">Senior Backend Engineer · Series A fintech · Berlin / remote</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone bg-paper px-2.5 py-1 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
          </span>
          <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-white">Shortlist due in 31h</span>
        </div>
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-4 border-b border-stone bg-paper-2">
        {STAGES.map((s, i) => (
          <Stage key={s.label} {...s} index={i} last={i === STAGES.length - 1} />
        ))}
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.55fr_1fr]">
        {/* Shortlist */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-stone p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">Ranked shortlist</p>
            <p className="text-[11px] text-graphite">Sorted by Nexus fit</p>
          </div>
          <ul className="mt-3 divide-y divide-stone">
            {SHORTLIST.map((c, i) => (
              <li key={c.name} className="hero-row flex items-center gap-3 py-2" style={{ animationDelay: `${400 + i * 160}ms` }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-[13px] text-paper">{c.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight">{c.name}</p>
                  <p className="truncate text-[11px] text-graphite">{c.headline}</p>
                </div>
                <div className="w-28 shrink-0">
                  <div className="flex justify-between text-[10px] text-graphite">
                    <span>Aria</span>
                    <span className="text-ink">{c.aria}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone">
                    <div className="hero-fill h-full rounded-full bg-brand" style={{ width: `${c.aria}%`, animationDelay: `${700 + i * 160}ms` }} />
                  </div>
                </div>
                <span className="w-10 shrink-0 text-right font-display text-[20px] leading-none">{c.fit}</span>
                <span
                  className={cn(
                    "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium",
                    c.status === "Interviewing" ? "bg-brand-soft text-brand" : "border border-stone text-graphite"
                  )}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center justify-between border-t border-stone pt-3">
            <p className="text-[11px] text-graphite">5 of 9 shown · all Aria-screened, references in progress</p>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-stone px-3 py-1 text-[11px] font-medium">Compare reports</span>
              <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-white">Send to hiring manager</span>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div className="flex min-h-0 flex-col">
          <div className="border-b border-stone p-4">
            <div className="flex items-center gap-3">
              <AriaPortrait size={34} />
              <div className="min-w-0">
                <p className="text-[12px] font-medium leading-tight">Aria is interviewing</p>
                <p className="truncate text-[11px] text-graphite">Priya Nair · Q4 of 9 · System design</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> 12:41
              </span>
            </div>
            <div className="mt-3 flex h-6 items-center gap-[3px]">
              {BARS.map((h, i) => (
                <span key={i} className="hero-bar w-[3px] rounded-full bg-ink/70" style={{ height: h, animationDelay: `${i * 70}ms` }} />
              ))}
              <span className="ml-2 text-[10px] text-graphite">Candidate speaking</span>
            </div>
          </div>
          <Feed />
        </div>
      </div>
    </div>
  );
}

function Stage({ label, target, index, last }: { label: string; target: number; index: number; last: boolean }) {
  const value = useCountUp(target, 1400 + index * 150);
  return (
    <div className={cn("relative px-5 py-3", !last && "border-r border-stone")}>
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-graphite">{label}</p>
      <p className="mt-0.5 font-display text-[28px] leading-none tabular-nums">{value.toLocaleString()}</p>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-stone">
        <div className="hero-fill h-full rounded-full bg-brand" style={{ width: `${100 - index * 22}%`, animationDelay: `${200 + index * 150}ms` }} />
      </div>
    </div>
  );
}

function Feed() {
  const [items, setItems] = useState(FEED.slice(0, 4));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 4;
    const id = setInterval(() => {
      const next = FEED[i % FEED.length];
      setItems((prev) => [next, ...prev.filter((p) => p.text !== next.text)].slice(0, 4));
      i += 1;
    }, 3600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-0 flex-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">Activity</p>
      <ul className="mt-2">
        {items.map((f, i) => (
          <li key={`${f.text}-${i}`} className={cn("flex items-start gap-2 py-1", i === 0 && "hero-row")}>
            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <p className="min-w-0 flex-1 truncate text-[11.5px] leading-snug">{f.text}</p>
            <span className="shrink-0 text-[10px] text-graphite">{f.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eases a number from 0 to target after mount. */
function useCountUp(target: number, duration: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export default HeroConsole;

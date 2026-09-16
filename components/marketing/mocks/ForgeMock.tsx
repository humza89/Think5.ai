import { cn } from "@/lib/utils";

/* ── Content ───────────────────────────────────────────────────────────── */
const MODELS = [
  { name: "GPT-5", score: 72.4, delta: "+3.1" },
  { name: "Claude Opus 4.7", score: 70.9, delta: "+2.6" },
  { name: "Gemini 3 Pro", score: 66.2, delta: "+1.8" },
  { name: "Open-weights baseline", score: 51.7, delta: "—" },
];

const STATS = [
  { label: "Items", value: "3,120" },
  { label: "QA pass", value: "99.7%" },
  { label: "Agreement", value: "0.91" },
  { label: "Experts", value: "48 MDs" },
];

const REVIEWERS = ["MD", "RN", "PhD", "MD"];

/** Deterministic pass/flag grid (no Math.random: must match on server and client). */
const GRID = Array.from({ length: 96 }, (_, i) => ((i * 37) % 23 === 0 ? "flag" : (i * 11) % 29 === 0 ? "review" : "pass"));

const SPARK = [18, 22, 20, 26, 31, 29, 34, 38, 36, 42, 41, 46, 50, 48, 54, 57, 55, 61, 64, 62, 68];

/**
 * Forge: data operations for frontier labs. Light, perspective-tilted stack
 * of panels: an eval leaderboard, run details with an item-level QA grid,
 * and a floating live expert-QA card.
 */
export function ForgeMock({ className }: { className?: string }) {
  const points = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * 100},${40 - (v / 70) * 40}`).join(" ");

  return (
    <div className={cn("relative [contain:inline-size]", className)}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" aria-hidden="true" />

      <div className="relative aspect-[16/12] [perspective:1600px] md:aspect-[16/11]">
        {/* Back panel: eval leaderboard */}
        <Panel className="absolute left-0 top-0 w-[74%] md:[transform:rotateY(-12deg)_rotateX(5deg)]">
          <div className="flex items-center gap-2 border-b border-stone px-4 py-3">
            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-brand">Forge</span>
            <p className="text-[12px] font-medium text-ink">RL environment · Clinical reasoning</p>
            <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-graphite">Held-out eval</span>
          </div>
          <ul className="px-4 py-3">
            {MODELS.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3 py-2">
                <span className="w-4 text-[10px] tabular-nums text-graphite/70">{i + 1}</span>
                <span className="w-[38%] truncate text-[12px] text-ink">{m.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone">
                  <div className="forge-fill h-full rounded-full bg-gradient-to-r from-brand to-[#8fa0ff]" style={{ width: `${m.score}%`, animationDelay: `${i * 120}ms` }} />
                </div>
                <span className="w-12 text-right font-display text-[16px] leading-none text-ink">{m.score}%</span>
                <span className={cn("w-9 text-right text-[10px] tabular-nums", m.delta === "—" ? "text-graphite/60" : "text-emerald-600")}>{m.delta}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-stone px-4 py-2.5 text-[10px] text-graphite">
            <span>Trained on Forge batches 4,402–4,471</span>
            <span className="text-ink">Δ vs. crowd-sourced data</span>
          </div>
        </Panel>

        {/* Front panel: run details */}
        <Panel className="forge-float absolute bottom-0 right-0 w-[70%] md:[transform:rotateY(-12deg)_rotateX(5deg)_translateZ(60px)]">
          <div className="flex items-center gap-2 border-b border-stone px-4 py-3">
            <p className="text-[12px] font-medium text-ink">Run details · Batch 4471</p>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Delivering
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 pt-3">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-[9px] uppercase tracking-[0.14em] text-graphite">{s.label}</p>
                <p className="mt-0.5 font-display text-[18px] leading-none text-ink">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] uppercase tracking-[0.14em] text-graphite">Expert QA · items 2,801–2,896</p>
              <p className="text-[10px] text-graphite">
                <span className="text-emerald-600">pass</span> · <span className="text-amber-600">review</span> · <span className="text-rose-600">flag</span>
              </p>
            </div>
            <div className="mt-2 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
              {GRID.map((g, i) => (
                <span
                  key={i}
                  className={cn(
                    "forge-cell aspect-square rounded-[2px]",
                    g === "pass" && "bg-emerald-500/75",
                    g === "review" && "bg-amber-400",
                    g === "flag" && "bg-rose-500"
                  )}
                  style={{ animationDelay: `${(i % 24) * 25 + Math.floor(i / 24) * 90}ms` }}
                />
              ))}
            </div>
          </div>
          <div className="px-4 pb-3 pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] uppercase tracking-[0.14em] text-graphite">Throughput · items / hr</p>
              <p className="font-display text-[14px] leading-none text-ink">412</p>
            </div>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-1.5 h-9 w-full" aria-hidden="true">
              <defs>
                <linearGradient id="forge-spark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1f3dff" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#1f3dff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,40 ${points} 100,40`} fill="url(#forge-spark)" />
              <polyline points={points} fill="none" stroke="#1f3dff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </Panel>

        {/* Floating card: live expert QA */}
        <Panel className="forge-float-slow absolute right-[2%] top-[4%] w-[36%] md:[transform:rotateY(-12deg)_rotateX(5deg)_translateZ(110px)]">
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-graphite">Expert QA · live</p>
            <div className="mt-2 flex items-center">
              <div className="flex -space-x-2">
                {REVIEWERS.map((r, i) => (
                  <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper-2 bg-ink font-display text-[11px] text-paper">
                    {r}
                  </span>
                ))}
              </div>
              <span className="ml-auto font-display text-[22px] leading-none text-ink">31</span>
            </div>
            <p className="mt-1.5 text-[10px] text-graphite">reviewing now · 3 of 3 must agree</p>
          </div>
        </Panel>
      </div>

      <style>{`
        @keyframes forge-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes forge-cell { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
        @keyframes forge-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
        .forge-fill { transform-origin: left; animation: forge-fill 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .forge-cell { animation: forge-cell 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .forge-float { animation: forge-float 7s ease-in-out infinite; }
        .forge-float-slow { animation: forge-float 9s ease-in-out infinite 1s; }
        @media (prefers-reduced-motion: reduce) { .forge-fill, .forge-cell, .forge-float, .forge-float-slow { animation: none; } }
      `}</style>
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-stone bg-paper-2/95 text-ink shadow-[0_30px_80px_-30px_rgba(10,10,11,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur",
        "[transform-style:preserve-3d]",
        className
      )}
    >
      {children}
    </div>
  );
}

export default ForgeMock;

import { AriaAvatar } from "@/components/brand/AriaAvatar";
import { cn } from "@/lib/utils";

const SIGNALS = [
  { label: "System design", value: 92 },
  { label: "Depth of reasoning", value: 88 },
  { label: "Communication", value: 85 },
  { label: "Role fit", value: 90 },
];

const BARS = [6, 14, 22, 12, 26, 18, 9, 20, 15, 8, 24, 11, 17, 7, 21, 13, 10, 19, 6, 16];

/** Aria: live AI interview console, drawn in HTML/CSS. Dark surface. */
export function AriaMock({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink text-white shadow-[0_40px_100px_-30px_rgba(10,10,11,0.6)] [contain:inline-size]">
        {/* Ambient */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/25 blur-3xl" aria-hidden="true" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />
        {/* Scan line */}
        <div className="aria-scan pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" aria-hidden="true" />

        {/* Header */}
        <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <AriaAvatar size={36} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-none">Aria</p>
            <p className="mt-1 truncate text-[11px] text-white/50">AI interviewer · Senior backend engineer · Round 1</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/60 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 182 ms
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live · 14:02
            </span>
          </div>
        </div>

        <div className="relative grid md:grid-cols-[1fr_190px]">
          {/* Transcript */}
          <div className="space-y-4 p-5">
            <Turn who="Aria">
              You mentioned a 40% latency regression after sharding the index. Walk me through how you isolated the cause.
            </Turn>
            <Turn who="Candidate" self>
              I bisected the deploys, then compared p99 traces. The hot path was a cross-shard fan-out serialising on a
              single coordinator&hellip;
            </Turn>
            <div className="flex flex-wrap gap-1.5 pl-1">
              <Chip>Probing · coordinator bottleneck</Chip>
              <Chip tone="brand">Follow-up queued</Chip>
            </div>
            <Turn who="Aria">
              Good. If the coordinator were the bottleneck, what would you expect to see in CPU versus wait time?
            </Turn>

            {/* Waveform */}
            <div className="flex items-center gap-3 border-t border-white/10 pt-4">
              <div className="flex h-7 items-center gap-[3px]" aria-hidden="true">
                {BARS.map((h, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-white/80"
                    style={{ height: h, transformOrigin: "center", animation: `aria-bar 1.1s ease-in-out ${i * 0.06}s infinite alternate` }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-white/50">
                Candidate speaking · <span className="text-white/80">transcribing</span>
              </p>
            </div>
          </div>

          {/* Telemetry rail */}
          <div className="border-t border-white/10 bg-white/[0.03] p-4 md:border-l md:border-t-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">Live signal</p>
            <ul className="mt-3 space-y-3">
              {SIGNALS.map((s) => (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-white/75">{s.label}</span>
                    <span className="font-display text-[18px] leading-none">{s.value}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.value}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">Proctoring</p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-white/70">
              <li className="flex justify-between"><span>Face match</span><span className="text-emerald-400">✓</span></li>
              <li className="flex justify-between"><span>Single tab</span><span className="text-emerald-400">✓</span></li>
              <li className="flex justify-between"><span>Paste events</span><span className="text-white/50">0</span></li>
              <li className="flex justify-between"><span>Language</span><span className="text-white/50">EN</span></li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes aria-bar { from { transform: scaleY(0.35) } to { transform: scaleY(1) } }
        @keyframes aria-scan { from { transform: translateY(0) } to { transform: translateY(420px) } }
        .aria-scan { animation: aria-scan 6s linear infinite; opacity: 0.7; }
        @media (prefers-reduced-motion: reduce) { .aria-scan { animation: none; } }
      `}</style>
    </div>
  );
}

function Turn({ who, self, children }: { who: string; self?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("max-w-[92%]", self && "ml-auto")}>
      <p className={cn("mb-1 text-[10px] font-medium uppercase tracking-[0.14em]", self ? "text-right text-white/45" : "text-brand")}>{who}</p>
      <p
        className={cn(
          "rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
          self ? "rounded-tr-sm bg-white text-ink" : "rounded-tl-sm border border-white/10 bg-white/[0.06] text-white/90 backdrop-blur"
        )}
      >
        {children}
      </p>
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        tone === "brand" ? "border-brand/40 bg-brand/15 text-[#aeb9ff]" : "border-white/10 bg-white/[0.04] text-white/60"
      )}
    >
      {children}
    </span>
  );
}

export default AriaMock;

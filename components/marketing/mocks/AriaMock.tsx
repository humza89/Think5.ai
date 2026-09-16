import { cn } from "@/lib/utils";

const SCORES = [
  { label: "Reasoning", value: 92 },
  { label: "Depth", value: 88 },
  { label: "Communication", value: 85 },
];

const BARS = [6, 14, 22, 12, 26, 18, 9, 20, 15, 8, 24, 11];

/** Aria: live technical interview surface, drawn in HTML/CSS. */
export function AriaMock({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {/* Window */}
      <div className="overflow-hidden rounded-2xl border border-stone bg-paper-2 shadow-[0_30px_80px_-30px_rgba(10,10,11,0.35)]">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-stone px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stone" />
            <span className="h-2.5 w-2.5 rounded-full bg-stone" />
            <span className="h-2.5 w-2.5 rounded-full bg-stone" />
          </div>
          <p className="text-[12px] text-graphite">
            <span className="font-medium text-ink">Aria</span> · Technical screen · ML Systems
          </p>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Live · 14:02
          </span>
        </div>

        <div className="grid md:grid-cols-[1fr_170px]">
          {/* Transcript */}
          <div className="space-y-4 p-5">
            <Bubble who="Aria">
              You mentioned a 40% latency regression after sharding the embedding index. Walk me through how you
              isolated the cause.
            </Bubble>
            <Bubble who="Candidate" self>
              I started by bisecting the deploys, then compared p99 traces. The hot path was a cross-shard fan-out that
              serialised on a single coordinator&hellip;
            </Bubble>
            <Bubble who="Aria">
              Good. If the coordinator were the bottleneck, what would you expect to see in CPU versus wait time?
            </Bubble>

            {/* Waveform */}
            <div className="flex items-end gap-[3px] pt-2" aria-hidden="true">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-ink/70"
                  style={{ height: h, animation: `aria-bar 1.2s ease-in-out ${i * 0.08}s infinite alternate` }}
                />
              ))}
              <span className="ml-3 text-[11px] text-graphite">Candidate speaking</span>
            </div>
          </div>

          {/* Score rail */}
          <div className="border-t border-stone bg-paper p-5 md:border-l md:border-t-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">Live signal</p>
            <ul className="mt-4 space-y-4">
              {SCORES.map((s) => (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-ink">{s.label}</span>
                    <span className="font-display text-[20px] leading-none text-ink">{s.value}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.value}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg border border-stone bg-paper-2 p-3 text-[11px] leading-relaxed text-graphite">
              <span className="font-medium text-ink">Proctoring</span> · face match ✓ · single tab ✓ · no paste events
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes aria-bar { from { transform: scaleY(0.4) } to { transform: scaleY(1) } }`}</style>
    </div>
  );
}

function Bubble({ who, self, children }: { who: string; self?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("max-w-[92%]", self && "ml-auto")}>
      <p className={cn("mb-1 text-[11px] font-medium", self ? "text-right text-graphite" : "text-brand")}>{who}</p>
      <p
        className={cn(
          "rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
          self ? "rounded-tr-sm bg-ink text-white" : "rounded-tl-sm bg-paper text-ink"
        )}
      >
        {children}
      </p>
    </div>
  );
}

export default AriaMock;

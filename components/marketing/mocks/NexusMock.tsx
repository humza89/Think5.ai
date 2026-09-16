import { cn } from "@/lib/utils";

/* ── Content ───────────────────────────────────────────────────────────── */
const RANKED = [
  { initials: "PN", name: "Priya Nair", headline: "Staff engineer · ex-Stripe · Berlin", fit: 96, aria: 94 },
  { initials: "DK", name: "Daniel Kim", headline: "Senior backend · fintech · remote", fit: 93, aria: 91 },
  { initials: "AO", name: "Amara Okafor", headline: "Platform lead · payments · London", fit: 90, aria: 89 },
  { initials: "LM", name: "Lucas Meyer", headline: "Backend · distributed systems · Munich", fit: 88, aria: 87 },
];

const FACTORS = [
  { label: "Skills, verified by Aria", value: 96 },
  { label: "Experience fit", value: 92 },
  { label: "Compensation alignment", value: 88 },
  { label: "Availability & location", value: 100 },
];

const EVIDENCE = [
  { k: "Aria interview", v: "94 · system design, depth" },
  { k: "References", v: "2 of 2 complete" },
  { k: "Comp band", v: "$195–220k · inside band" },
  { k: "Start", v: "4 weeks · notice served" },
];

const MARKETS = ["Berlin", "London", "Remote EU"];

/**
 * Nexus: matching engine. Light, perspective-tilted stack: ranked matches,
 * a match-rationale panel with the fit breakdown and evidence, and a
 * floating live-sourcing card.
 */
export function NexusMock({ className }: { className?: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const fit = 96;

  return (
    <div className={cn("relative [contain:inline-size]", className)}>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" aria-hidden="true" />

      <div className="relative aspect-[16/12] [perspective:1600px] md:aspect-[16/11]">
        {/* Back panel: ranked matches */}
        <Panel className="absolute left-0 top-0 w-[72%] md:[transform:rotateY(12deg)_rotateX(5deg)]">
          <div className="flex items-center gap-2 border-b border-stone px-4 py-3">
            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-brand">Nexus</span>
            <p className="text-[12px] font-medium text-ink">Matches · Senior Backend Engineer</p>
            <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-graphite">Ranked by fit</span>
          </div>
          <ul className="px-4 py-2">
            {RANKED.map((m, i) => (
              <li key={m.name} className="nexus-row flex items-center gap-3 border-b border-stone py-2.5 last:border-b-0" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-[12px] text-paper">{m.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium leading-tight text-ink">{m.name}</p>
                  <p className="truncate text-[10.5px] text-graphite">{m.headline}</p>
                </div>
                <div className="w-20 shrink-0">
                  <div className="flex justify-between text-[9px] text-graphite">
                    <span>Aria</span>
                    <span className="text-ink">{m.aria}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone">
                    <div className="nexus-fill h-full rounded-full bg-brand" style={{ width: `${m.aria}%`, animationDelay: `${200 + i * 120}ms` }} />
                  </div>
                </div>
                <span className="w-9 shrink-0 text-right font-display text-[20px] leading-none text-ink">{m.fit}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-stone px-4 py-2.5 text-[10px] text-graphite">
            <span>1,284 sourced · 412 Aria-screened · 9 shortlisted</span>
            <span className="text-ink">Shortlist in 31h</span>
          </div>
        </Panel>

        {/* Front panel: match rationale */}
        <Panel className="nexus-float absolute bottom-0 right-0 w-[64%] md:[transform:rotateY(12deg)_rotateX(5deg)_translateZ(60px)]">
          <div className="flex items-center gap-3 border-b border-stone px-4 py-3">
            <div className="relative h-14 w-14 shrink-0">
              <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
                <circle cx="28" cy="28" r={r} className="stroke-stone" strokeWidth="5" fill="none" />
                <circle cx="28" cy="28" r={r} className="nexus-ring stroke-brand" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - fit / 100)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[18px] leading-none text-ink">{fit}</span>
                <span className="text-[7px] uppercase tracking-[0.12em] text-graphite">fit</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink">Match rationale · Priya Nair</p>
              <p className="truncate text-[10.5px] text-graphite">Weighted on the role brief · updated 2m ago</p>
            </div>
          </div>
          <ul className="space-y-2 px-4 pt-3">
            {FACTORS.map((f, i) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between text-[10.5px]">
                  <span className="text-ink">{f.label}</span>
                  <span className="font-display text-[14px] leading-none text-ink">{f.value}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone">
                  <div className="nexus-fill h-full rounded-full bg-gradient-to-r from-brand to-[#8fa0ff]" style={{ width: `${f.value}%`, animationDelay: `${400 + i * 120}ms` }} />
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-stone px-4 py-3">
            {EVIDENCE.map((e) => (
              <div key={e.k} className="min-w-0">
                <dt className="text-[9px] uppercase tracking-[0.12em] text-graphite">{e.k}</dt>
                <dd className="truncate text-[10.5px] text-ink">{e.v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {/* Floating card: live sourcing */}
        <Panel className="nexus-float-slow absolute right-[1%] top-[3%] w-[34%] md:[transform:rotateY(12deg)_rotateX(5deg)_translateZ(110px)]">
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-graphite">Sourcing · live</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-display text-[24px] leading-none text-ink">+48</span>
              <span className="text-[10px] text-graphite">today</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {MARKETS.map((m) => (
                <span key={m} className="rounded-full border border-stone bg-paper px-1.5 py-0.5 text-[9px] text-ink">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <style>{`
        @keyframes nexus-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes nexus-row { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes nexus-ring { from { stroke-dashoffset: ${c}; } }
        @keyframes nexus-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
        .nexus-fill { transform-origin: left; animation: nexus-fill 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .nexus-row { animation: nexus-row 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .nexus-ring { animation: nexus-ring 1.4s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .nexus-float { animation: nexus-float 7s ease-in-out infinite; }
        .nexus-float-slow { animation: nexus-float 9s ease-in-out infinite 1s; }
        @media (prefers-reduced-motion: reduce) { .nexus-fill, .nexus-row, .nexus-ring, .nexus-float, .nexus-float-slow { animation: none; } }
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

export default NexusMock;

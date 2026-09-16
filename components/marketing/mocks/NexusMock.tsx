import { cn } from "@/lib/utils";

const TAGS = ["Computational biology", "PyTorch", "Protein folding", "RLHF rater"];

/** Nexus: expert-to-project match card with a fit score. */
export function NexusMock({ className }: { className?: string }) {
  const score = 96;
  const r = 30;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("relative mx-auto max-w-md", className)}>
      {/* Back cards */}
      <div aria-hidden="true" className="absolute inset-x-6 -top-4 h-full rounded-2xl border border-stone bg-paper-2/70" />
      <div aria-hidden="true" className="absolute inset-x-3 -top-2 h-full rounded-2xl border border-stone bg-paper-2/90" />

      {/* Front card */}
      <div className="relative overflow-hidden rounded-2xl border border-stone bg-paper-2 p-6 shadow-[0_30px_80px_-30px_rgba(10,10,11,0.35)] [contain:inline-size]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-[22px] text-paper">
            SC
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-ink">Sarah Chen, PhD</p>
            <p className="text-[13px] leading-snug text-graphite">Computational Biology · Stanford · 9 yrs</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <span key={t} className="rounded-full border border-stone bg-paper px-2.5 py-1 text-[11px] text-ink">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Fit ring */}
          <div className="relative h-[76px] w-[76px] shrink-0">
            <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
              <circle cx="38" cy="38" r={r} className="stroke-stone" strokeWidth="6" fill="none" />
              <circle
                cx="38"
                cy="38"
                r={r}
                className="stroke-brand"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - score / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[22px] leading-none text-ink">{score}</span>
              <span className="text-[9px] uppercase tracking-[0.12em] text-graphite">fit</span>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">Match rationale</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink">
            Top 2% on Aria&apos;s ML reasoning screen. 1,240 rated preference pairs at 0.91 inter-rater agreement.
            Available 20 hrs/week, PST.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[12px] text-graphite">
            Project · <span className="text-ink">Frontier bio-reasoning evals</span>
          </p>
          <span className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[12px] font-medium text-white">Deploy</span>
        </div>
      </div>
    </div>
  );
}

export default NexusMock;

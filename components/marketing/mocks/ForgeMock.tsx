import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Task spec", count: "1 brief", done: true },
  { label: "Expert pool", count: "48 matched", done: true },
  { label: "Generation", count: "3,120 items", done: true },
  { label: "Expert QA", count: "2,874 passed", done: false, active: true },
  { label: "Delivery", count: "JSONL · S3", done: false },
];

/** Forge: data pipeline stage strip for a live batch. */
export function ForgeMock({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-stone bg-paper-2 p-6 shadow-[0_30px_80px_-30px_rgba(10,10,11,0.35)]", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">Batch 4471</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">RLHF preference pairs · Medicine</p>
        </div>
        <p className="text-[12px] text-graphite">
          Quality gate <span className="font-medium text-ink">99.7%</span> · ETA <span className="font-medium text-ink">6h</span>
        </p>
      </div>

      {/* Stage strip */}
      <div className="relative mt-8">
        <div className="absolute left-3 right-3 top-3 h-px bg-stone" aria-hidden="true" />
        <div className="absolute left-3 top-3 h-px w-[68%] bg-brand" aria-hidden="true" />
        <ol className="relative grid grid-cols-5 gap-2">
          {STAGES.map((s) => (
            <li key={s.label} className="flex flex-col items-start">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                  s.done && "border-brand bg-brand text-white",
                  s.active && "border-brand bg-paper-2 text-brand ring-4 ring-brand-soft",
                  !s.done && !s.active && "border-stone bg-paper-2 text-graphite"
                )}
              >
                {s.done ? "✓" : s.active ? "•" : ""}
              </span>
              <p className={cn("mt-3 text-[12px] font-medium leading-tight", s.done || s.active ? "text-ink" : "text-graphite")}>{s.label}</p>
              <p className="mt-1 text-[11px] text-graphite">{s.count}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Sample row */}
      <div className="mt-8 grid gap-3 rounded-xl border border-stone bg-paper p-4 text-[12px] md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-graphite">Item 2,875 · pending review</p>
          <p className="mt-1 truncate text-ink">
            &ldquo;Compare two differential diagnoses for a 54-year-old presenting with&hellip;&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-2 self-center">
          <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] text-white">Response A preferred</span>
          <span className="text-graphite">by 3 of 3 MDs</span>
        </div>
      </div>
    </div>
  );
}

export default ForgeMock;

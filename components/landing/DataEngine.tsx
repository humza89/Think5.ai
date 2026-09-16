"use client";

import { Container, SectionTitle, StatRow, Reveal } from "@/components/marketing/primitives";

const CAPABILITIES = [
  { label: "RLHF", description: "Reinforcement learning from human feedback" },
  { label: "SFT", description: "Supervised fine-tuning pipelines" },
  { label: "VLMs", description: "Vision-language training data" },
  { label: "Reasoning", description: "Complex logical reasoning datasets" },
  { label: "Multi-modal", description: "Cross-modal understanding data" },
  { label: "Red teaming", description: "Safety and adversarial testing" },
];

const STATS = [
  { value: "10M+", label: "Data points processed" },
  { value: "500+", label: "Expert contributors" },
  { value: "99.7%", label: "Quality score" },
  { value: "24/7", label: "Global operations" },
];

export function DataEngine() {
  return (
    <section className="bg-paper pb-24 md:pb-32">
      <Container>
        <Reveal className="grain relative overflow-hidden rounded-[28px] border border-stone bg-paper-2 p-8 md:p-14">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <SectionTitle
                eyebrow="Data engine"
                title={
                  <>
                    The data engine behind <span className="italic text-graphite">frontier</span> models.
                  </>
                }
                lede="End-to-end human data operations converting expert intelligence into the datasets that shape how AI reasons, adapts and evolves."
              />
            </div>
            <ul className="grid gap-x-8 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
              {CAPABILITIES.map((c, i) => (
                <li key={c.label} className="flex items-baseline gap-4 border-t border-stone py-5">
                  <span className="w-6 text-[12px] tabular-nums text-graphite">0{i + 1}</span>
                  <div>
                    <p className="font-display text-[26px] leading-none tracking-[-0.01em] text-ink">{c.label}</p>
                    <p className="mt-1.5 text-[13px] text-graphite">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <StatRow stats={STATS} className="mt-14 md:mt-20" />
        </Reveal>
      </Container>
    </section>
  );
}

export default DataEngine;

"use client";

import { Container, Eyebrow, Reveal } from "@/components/marketing/primitives";

const PILLARS = [
  {
    n: "01",
    title: "Source",
    body:
      "Our AI engine finds the people job boards never surface — engineers, clinicians, analysts and site leads across 150+ countries — and reaches out within hours of a brief.",
  },
  {
    n: "02",
    title: "Vet",
    body:
      "Aria, our AI interviewer, screens every candidate live: structured, proctored, in 50+ languages. You read a scored report, not a résumé.",
  },
  {
    n: "03",
    title: "Place",
    body:
      "A shortlist in 48 hours. We run scheduling, references, offers and compliance, so a first hire or a fiftieth lands without slowing the team down.",
  },
];

export function Manifesto() {
  return (
    <section className="relative bg-paper py-24 md:py-36">
      <Container>
        <Reveal>
          <Eyebrow className="mb-8">What we do</Eyebrow>
          <p className="max-w-5xl font-display text-[38px] leading-[1.08] tracking-[-0.02em] text-ink md:text-[64px]">
            Hiring is the highest-leverage decision a company makes. We make it{" "}
            <span className="italic text-graphite">fast, rigorous</span> and fair.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-10 md:grid-cols-3 md:gap-8">
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} delay={i * 120} className="border-t border-ink/15 pt-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-[32px] leading-none tracking-[-0.02em] text-ink">{p.title}</h3>
                <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">{p.n}</span>
              </div>
              <p className="mt-5 text-[15px] leading-relaxed text-graphite">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default Manifesto;

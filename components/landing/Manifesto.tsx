"use client";

import { Container, Eyebrow, Reveal } from "@/components/marketing/primitives";

const PILLARS = [
  {
    n: "01",
    title: "Source",
    body:
      "Our AI engine identifies and reaches out to top experts across every domain — PhDs, engineers, doctors, lawyers, and specialists — across 150+ countries.",
  },
  {
    n: "02",
    title: "Vet",
    body:
      "Aria, our AI interviewer, conducts rigorous technical assessments in real time. Only the top 1% of applicants make it into the network.",
  },
  {
    n: "03",
    title: "Deploy",
    body:
      "Matched experts are deployed to RLHF, evaluation, red-teaming and custom data work, with QA, payroll and compliance handled end to end.",
  },
];

export function Manifesto() {
  return (
    <section className="relative bg-paper py-24 md:py-36">
      <Container>
        <Reveal>
          <Eyebrow className="mb-8">What we do</Eyebrow>
          <p className="max-w-5xl font-display text-[38px] leading-[1.08] tracking-[-0.02em] text-ink md:text-[64px]">
            A model is only as good as its data. Beneath every breakthrough is an{" "}
            <span className="italic text-graphite">orchestra</span> of human expertise. Think5 conducts it.
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

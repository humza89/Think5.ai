"use client";

import { Container, SectionTitle, StatRow, Reveal } from "@/components/marketing/primitives";

const STEPS = [
  {
    n: "01",
    title: "AI sources experts",
    body: "Our engine identifies and reaches out to top experts across every domain — PhDs, engineers, doctors, lawyers and specialists.",
  },
  {
    n: "02",
    title: "Aria vets candidates",
    body: "Rigorous technical assessments, live. Only the top 1% of applicants make it into the network.",
  },
  {
    n: "03",
    title: "Deploy to projects",
    body: "Matched experts land on your RLHF, evaluation, red-teaming or custom data work within days.",
  },
  {
    n: "04",
    title: "Managed QA and delivery",
    body: "We run quality assurance, performance tracking, payroll and compliance. You get high-quality data, guaranteed.",
  },
];

const STATS = [
  { value: "1,000+", label: "Interviews daily" },
  { value: "1%", label: "Acceptance rate" },
  { value: "24–48h", label: "Matching time" },
  { value: "150+", label: "Countries covered" },
];

export function HowItWorks() {
  return (
    <section className="bg-paper py-24 md:py-32">
      <Container>
        <Reveal>
          <SectionTitle
            eyebrow="How it works"
            title={
              <>
                From first contact to delivered data, <span className="italic text-graphite">end to end</span>.
              </>
            }
            lede="We don't just connect you with experts. We manage the entire workflow from sourcing to delivery."
          />
        </Reveal>

        <ol className="relative mt-16 grid gap-10 md:mt-20 md:grid-cols-4 md:gap-8">
          <div className="absolute left-0 right-0 top-[11px] hidden h-px bg-ink/15 md:block" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} as="li" delay={i * 100} className="relative">
              <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-ink bg-paper text-[10px] font-medium tabular-nums text-ink">
                {i + 1}
              </span>
              <h3 className="mt-6 font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-ink">{s.title}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-graphite">{s.body}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-24">
          <StatRow stats={STATS} />
        </Reveal>
      </Container>
    </section>
  );
}

export default HowItWorks;

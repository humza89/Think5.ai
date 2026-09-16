"use client";

import { Container, SectionTitle, StatRow, Reveal } from "@/components/marketing/primitives";

const STEPS = [
  {
    title: "Brief us",
    body: "Role, team, comp band and what great looks like. A 30-minute call or a job description is enough to start.",
  },
  {
    title: "AI sources, Aria vets",
    body: "Our engine reaches candidates across 150+ countries. Aria interviews every one of them live and scores the results.",
  },
  {
    title: "Shortlist in 48 hours",
    body: "You get a ranked shortlist with interview recordings, scored reports and verified credentials. No résumé piles.",
  },
  {
    title: "Place and onboard",
    body: "We run scheduling, references, offers and compliance through to day one, then keep the pipeline warm.",
  },
];

const STATS = [
  { value: "1,000+", label: "Interviews daily" },
  { value: "48h", label: "To shortlist" },
  { value: "1%", label: "Acceptance rate" },
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
                From brief to signed offer, <span className="italic text-graphite">end to end</span>.
              </>
            }
            lede="We don't hand you a list of names. We run the whole hiring workflow and you make the final call."
          />
        </Reveal>

        <ol className="relative mt-16 grid gap-10 md:mt-20 md:grid-cols-4 md:gap-8">
          <div className="absolute left-0 right-0 top-[11px] hidden h-px bg-ink/15 md:block" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} as="li" delay={i * 100} className="relative">
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

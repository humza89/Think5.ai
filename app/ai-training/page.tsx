"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CtaBand } from "@/components/marketing/CtaBand";
import { LogoWall } from "@/components/marketing/LogoWall";
import { DataEngine } from "@/components/landing/DataEngine";
import { Container, Eyebrow, SectionTitle, StatRow, Reveal } from "@/components/marketing/primitives";
import { pill } from "@/components/marketing/styles";
import { ForgeMock } from "@/components/marketing/mocks/ForgeMock";
import { NexusMock } from "@/components/marketing/mocks/NexusMock";

const STEPS = [
  { title: "Scope the task", body: "Modality, domain, rubric and volume. We turn a one-page brief into a task spec and a pilot batch within days." },
  { title: "Assemble the pool", body: "Nexus pulls Aria-vetted experts by domain, language and track record. MDs for medicine, JDs for law, PhDs for reasoning." },
  { title: "Generate and review", body: "Experts produce data in Forge with layered QA: automated checks, peer review and calibration against gold sets." },
  { title: "Deliver and iterate", body: "Batches ship to your bucket in your schema, with agreement metrics and audit trails. Rubrics tighten every cycle." },
];

const EXPERTS = [
  { n: "01", title: "Medicine", body: "Board-certified physicians, nurses and pharmacists for clinical reasoning, safety and preference data." },
  { n: "02", title: "Law & finance", body: "Practising lawyers, CPAs and analysts for contracts, regulation, tax and financial reasoning tasks." },
  { n: "03", title: "STEM & research", body: "PhDs in mathematics, physics, biology and CS for hard reasoning, proofs and evaluation design." },
  { n: "04", title: "Software", body: "Senior engineers for code generation, review, agentic evaluations and environment building." },
];

export default function AiTrainingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader tone="light" />

      {/* Hero */}
      <section className="relative overflow-hidden pt-40 pb-16 md:pt-48 md:pb-24">
        <div className="dot-grid-light absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" aria-hidden="true" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Eyebrow className="mb-6">AI training data</Eyebrow>
              <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[88px]">
                Expert human data for <span className="italic text-graphite">frontier</span> models.
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pb-3">
              <p className="text-[17px] leading-relaxed text-graphite">
                The experts Aria has already vetted for hiring produce the preference data, evaluations and red-team
                findings that frontier labs train and measure on.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/contact" className={pill.ink}>
                  Start a pilot <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/research" className={pill.ghostLight}>
                  Read the research
                </Link>
              </div>
            </div>
          </div>
          <Reveal className="mt-16 md:mt-20">
            <StatRow
              stats={[
                { value: "10M+", label: "Data points delivered" },
                { value: "500+", label: "Expert contributors" },
                { value: "99.7%", label: "Quality gate pass" },
                { value: "100+", label: "Domains covered" },
              ]}
            />
          </Reveal>
        </Container>
      </section>

      <LogoWall tone="light" label="Data partner to teams building frontier AI" />

      {/* Forge */}
      <section className="py-24 md:py-32">
        <Container>
          <Reveal className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionTitle
                eyebrow="Forge · data operations"
                title={
                  <>
                    A pipeline built for <span className="italic text-graphite">expert</span> work, not crowd work.
                  </>
                }
                lede="Task specs, expert pools, generation, layered QA and delivery in one system, with audit trails on every item."
              />
              <ul className="mt-8 divide-y divide-stone border-y border-stone">
                {["Gold-set calibration and inter-rater agreement per batch", "Your schema, your bucket, your cadence", "SOC 2 controls, NDAs and data residency options"].map((t) => (
                  <li key={t} className="flex items-start gap-3 py-3.5 text-[15px] text-ink">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7">
              <ForgeMock />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Capabilities (reused data engine card) */}
      <DataEngine />

      {/* Experts */}
      <section className="border-t border-stone py-24 md:py-32">
        <Container>
          <Reveal className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:order-2 lg:col-span-6 lg:col-start-7">
              <SectionTitle
                eyebrow="The network"
                title={
                  <>
                    Vetted once by Aria. <span className="italic text-graphite">Deployed</span> everywhere.
                  </>
                }
                lede="Every contributor passed a live, proctored interview before joining. Nexus matches them to your task by domain, language and measured quality."
              />
              <div className="mt-12 grid gap-8 sm:grid-cols-2">
                {EXPERTS.map((e) => (
                  <div key={e.n} className="border-t border-ink/15 pt-5">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-[26px] leading-none tracking-[-0.01em] text-ink">{e.title}</h3>
                      <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">{e.n}</span>
                    </div>
                    <p className="mt-3 text-[14px] leading-relaxed text-graphite">{e.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:order-1 lg:col-span-6 lg:pt-6">
              <NexusMock />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-t border-stone py-24 md:py-32">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="How it works" title={<>From brief to delivered batch in <span className="italic text-graphite">days</span>.</>} />
          </Reveal>
          <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-8">
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
        </Container>
      </section>

      <CtaBand
        eyebrow="Pilot"
        title={
          <>
            Run a pilot batch <span className="italic text-white/70">this month</span>.
          </>
        }
        lede="Tell us the modality and domain. We'll scope a task spec, assemble the pool and ship a calibrated pilot."
        primary={{ label: "Start a pilot", href: "/contact" }}
        secondary={{ label: "See the platform", href: "/product" }}
      />
      <SiteFooter />
    </main>
  );
}

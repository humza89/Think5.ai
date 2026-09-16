"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, SectionTitle, Reveal } from "@/components/marketing/primitives";
import { pill } from "@/components/marketing/styles";

const INDUSTRIES = [
  {
    n: "01",
    name: "IT & Engineering",
    body: "Backend, ML, infra, security and product roles, screened by an interviewer that actually probes system design.",
    roles: ["Software engineers", "ML & data", "DevOps & SRE", "Product & design"],
  },
  {
    n: "02",
    name: "Healthcare",
    body: "Clinical and allied health talent with credential verification built into the vetting flow.",
    roles: ["Nurses & clinicians", "Allied health", "Health IT", "Medical affairs"],
  },
  {
    n: "03",
    name: "Finance",
    body: "Analysts, quants, accountants and compliance hires for fintechs, funds and finance teams.",
    roles: ["Analysts & quants", "Accounting & FP&A", "Risk & compliance", "Fintech engineering"],
  },
  {
    n: "04",
    name: "Construction",
    body: "Project managers, engineers, estimators and site leadership, vetted for certifications and safety records.",
    roles: ["Project managers", "Civil & structural", "Estimators & QS", "Site supervisors"],
  },
];

export function Industries() {
  return (
    <section className="bg-paper pb-24 md:pb-32">
      <Container>
        <Reveal>
          <SectionTitle
            eyebrow="Industries"
            title={
              <>
                Built for the roles that are <span className="italic text-graphite">hardest</span> to fill.
              </>
            }
            lede="One platform, tuned per industry: the interview rubric, the credential checks and the sourcing pools all change with the role."
          />
        </Reveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-12">
          {/* Startups: highlighted */}
          <Reveal className="relative overflow-hidden rounded-[28px] bg-ink p-8 text-white md:p-10 lg:col-span-5">
            <div className="dot-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" aria-hidden="true" />
            <div className="relative flex h-full flex-col">
              <p className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> For startups
              </p>
              <h3 className="mt-6 font-display text-[40px] leading-[1.02] tracking-[-0.02em] md:text-[52px]">
                From first hire to <span className="italic text-white/60">Series C</span>.
              </h3>
              <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/65">
                Founders don&apos;t have a talent team. We are one. Embedded recruiting on a flat monthly retainer,
                Aria-screened shortlists in 48 hours, and no placement fee surprises.
              </p>
              <ul className="mt-8 divide-y divide-white/10 border-y border-white/10 text-[14px]">
                {["Flat monthly retainer, cancel any time", "Founding engineers, GTM and ops hires", "Comp benchmarks and offer support included"].map((t) => (
                  <li key={t} className="flex items-start gap-3 py-3">
                    <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link href="/contact" className={pill.paper}>
                  Talk to us about your team <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>

          {/* Industry grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
            {INDUSTRIES.map((ind, i) => (
              <Reveal key={ind.name} delay={i * 80} className="flex flex-col rounded-[24px] border border-stone bg-paper-2 p-7">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-[28px] leading-none tracking-[-0.01em] text-ink">{ind.name}</h3>
                  <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">{ind.n}</span>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-graphite">{ind.body}</p>
                <ul className="mt-5 flex flex-wrap gap-1.5">
                  {ind.roles.map((r) => (
                    <li key={r} className="rounded-full border border-stone bg-paper px-2.5 py-1 text-[11px] text-ink">
                      {r}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default Industries;

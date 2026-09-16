"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Container, Eyebrow, StatRow, Reveal } from "@/components/marketing/primitives";
import { pill } from "@/components/marketing/styles";
import { AriaPortrait } from "@/components/brand/AriaPortrait";

interface Industry {
  id: string;
  name: string;
  tagline: string;
  lede: string;
  roles: string[];
  vetting: { title: string; body: string }[];
  rubric: string[];
  typical: string;
}

const INDUSTRIES: Industry[] = [
  {
    id: "it",
    name: "IT & Engineering",
    tagline: "Interviewed by something that can actually read the code.",
    lede: "Backend, ML, infrastructure, security and product roles for startups and enterprises. Aria runs a live technical screen for every applicant, so your engineers only interview people who have already been tested.",
    roles: ["Software engineers", "ML & data scientists", "DevOps & SRE", "Security engineers", "Engineering managers", "Product & design"],
    vetting: [
      { title: "Live technical screen", body: "Aria probes system design, debugging and depth of reasoning with adaptive follow-ups, in the candidate's language." },
      { title: "Evidence, not keywords", body: "Nexus ranks on interview evidence and verified experience, not résumé term-matching." },
      { title: "Team-fit round", body: "Shortlisted candidates get a structured behavioural screen against your team's working norms." },
    ],
    rubric: ["System design", "Debugging & reasoning", "Code quality signals", "Communication", "Ownership"],
    typical: "Senior backend engineer · shortlist in 48h · 5 candidates · 2 offers",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    tagline: "Credentialed, licensed and clinically vetted before you see them.",
    lede: "Nurses, allied health, clinicians, health IT and medical affairs roles. Licensure and credential verification are built into the vetting flow, not bolted on at offer stage.",
    roles: ["Registered nurses", "Allied health", "Physicians & locums", "Health IT & informatics", "Medical affairs", "Care coordinators"],
    vetting: [
      { title: "Licence & credential checks", body: "Registration, specialty certifications and right-to-work verified against primary sources before shortlisting." },
      { title: "Clinical scenario interview", body: "Aria runs scenario-based screens written with practising clinicians, scored on judgement and safety." },
      { title: "Compliance ready", body: "References, background and occupational health steps tracked to your onboarding requirements." },
    ],
    rubric: ["Clinical judgement", "Patient safety", "Documentation", "Communication", "Regulatory awareness"],
    typical: "ICU nurse cohort · 12 placements · credentialed in 9 days",
  },
  {
    id: "finance",
    name: "Finance",
    tagline: "Analysts, quants and compliance leads who pass a real case.",
    lede: "For fintechs, funds and finance teams. Candidates work through case and modelling exercises with Aria before a human ever schedules a call.",
    roles: ["Financial analysts", "Quant researchers", "Accounting & FP&A", "Risk & compliance", "Fintech engineers", "Treasury & operations"],
    vetting: [
      { title: "Case-based screen", body: "Aria walks candidates through a modelling or analysis case tailored to the role and scores the reasoning." },
      { title: "Regulatory fit", body: "Qualifications (CFA, ACCA, CPA, FRM and local equivalents) verified; regulated-role checks handled." },
      { title: "Comp benchmarking", body: "Every shortlist comes with a live comp band so offers land the first time." },
    ],
    rubric: ["Quantitative reasoning", "Modelling accuracy", "Risk awareness", "Commercial judgement", "Communication"],
    typical: "Risk & compliance lead · 4 shortlisted · offer accepted in 3 weeks",
  },
  {
    id: "construction",
    name: "Construction",
    tagline: "Site leadership with the certifications and safety record to match.",
    lede: "Project managers, civil and structural engineers, estimators, quantity surveyors and site supervisors. Certifications and safety history are checked before anyone reaches your shortlist.",
    roles: ["Project managers", "Civil & structural engineers", "Estimators & QS", "Site supervisors", "Health & safety leads", "BIM & planning"],
    vetting: [
      { title: "Certification checks", body: "Trade and safety certifications, chartered status and site cards verified against issuing bodies." },
      { title: "Project-based interview", body: "Aria walks candidates through a real programme: sequencing, risk, cost and subcontractor management." },
      { title: "Safety record", body: "Incident history and references gathered with consent before shortlisting." },
    ],
    rubric: ["Programme & sequencing", "Cost control", "Safety leadership", "Stakeholder management", "Technical depth"],
    typical: "Senior estimator · 6 shortlisted · start within notice period",
  },
  {
    id: "startups",
    name: "Startups",
    tagline: "An embedded talent team from first hire to Series C.",
    lede: "Founders don't have a recruiting function. We are one: a flat monthly retainer, a practice lead embedded with your team, Aria-screened shortlists in 48 hours and no placement fee surprises.",
    roles: ["Founding engineers", "First GTM hires", "Operations & finance", "Product & design", "Head-of roles", "Executive search"],
    vetting: [
      { title: "Founder-calibrated rubric", body: "We build the interview rubric with you in week one, so Aria screens for what your stage actually needs." },
      { title: "Speed with a bar", body: "Every applicant is interviewed live; you see a ranked shortlist with recordings, not a pile of résumés." },
      { title: "Offer support", body: "Comp benchmarks, equity framing and closing support included in the retainer." },
    ],
    rubric: ["Ownership", "Range & ambiguity", "Craft", "Velocity", "Values fit"],
    typical: "Three founding engineers · signed in five weeks",
  },
];

export default function RecruitmentPage() {
  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden pt-40 pb-16 md:pt-48 md:pb-24">
        <div className="dot-grid-light absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" aria-hidden="true" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Eyebrow className="mb-6">Recruitment</Eyebrow>
              <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[88px]">
                Recruiting built for <span className="italic text-graphite">each</span> industry.
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pb-3">
              <p className="text-[17px] leading-relaxed text-graphite">
                One platform, tuned per sector. The interview rubric, the credential checks and the sourcing pools all
                change with the role, and each practice is led by someone who worked in that industry.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {INDUSTRIES.map((ind) => (
                  <a
                    key={ind.id}
                    href={`#${ind.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone bg-paper-2 px-4 text-[13px] font-medium text-ink transition-colors hover:border-ink"
                  >
                    {ind.name} <ArrowUpRight className="h-3.5 w-3.5 text-graphite" />
                  </a>
                ))}
              </div>
            </div>
          </div>
          <Reveal className="mt-16 md:mt-20">
            <StatRow
              stats={[
                { value: "48h", label: "To shortlist" },
                { value: "1,000+", label: "Interviews daily" },
                { value: "150+", label: "Countries covered" },
                { value: "1%", label: "Acceptance rate" },
              ]}
            />
          </Reveal>
        </Container>
      </section>

      {/* Industries */}
      {INDUSTRIES.map((ind, i) => (
        <section key={ind.id} id={ind.id} className="scroll-mt-24 border-t border-stone py-24 md:py-32">
          <Container>
            <Reveal className="grid gap-12 lg:grid-cols-12 lg:gap-16">
              {/* Copy */}
              <div className="lg:col-span-5">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">0{i + 1}</span>
                  <Eyebrow>{ind.name}</Eyebrow>
                </div>
                <h2 className="mt-6 font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[64px]">{ind.tagline}</h2>
                <p className="mt-6 max-w-md text-[16px] leading-relaxed text-graphite">{ind.lede}</p>

                <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.18em] text-graphite">Roles we fill</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {ind.roles.map((r) => (
                    <li key={r} className="rounded-full border border-stone bg-paper-2 px-3 py-1.5 text-[13px] text-ink">
                      {r}
                    </li>
                  ))}
                </ul>

                <Link href="/contact" className={`${pill.ink} mt-10`}>
                  Hire in {ind.name} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Process + rubric */}
              <div className="lg:col-span-7">
                <ol className="divide-y divide-stone border-y border-stone">
                  {ind.vetting.map((v, vi) => (
                    <li key={v.title} className="grid gap-2 py-5 md:grid-cols-[48px_1fr]">
                      <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">0{vi + 1}</span>
                      <div>
                        <h3 className="font-display text-[24px] leading-tight tracking-[-0.01em] text-ink">{v.title}</h3>
                        <p className="mt-2 text-[14px] leading-relaxed text-graphite">{v.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-8 grid gap-6 md:grid-cols-[1fr_auto]">
                  <div className="rounded-[20px] border border-stone bg-paper-2 p-5">
                    <div className="flex items-center gap-3">
                      <AriaPortrait size={36} />
                      <div>
                        <p className="text-[13px] font-medium text-ink">Aria rubric · {ind.name}</p>
                        <p className="text-[11px] text-graphite">What every candidate is scored on</p>
                      </div>
                    </div>
                    <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                      {ind.rubric.map((r) => (
                        <li key={r} className="flex items-center gap-2 text-[13px] text-ink">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[20px] border border-stone bg-ink p-5 text-white md:w-64">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Typical engagement</p>
                    <p className="mt-3 font-display text-[20px] leading-tight">{ind.typical}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      ))}

      <CtaBand
        eyebrow="Start a search"
        title={
          <>
            Brief us today, meet candidates <span className="italic text-white/70">this week</span>.
          </>
        }
        lede="Tell us the role and the industry. A practice lead will come back within one business day."
        primary={{ label: "Book a call", href: "/contact" }}
        secondary={{ label: "Meet the team", href: "/team" }}
      />
      <SiteFooter />
    </main>
  );
}

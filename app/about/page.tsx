"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Container, Eyebrow, SectionTitle, StatRow, Reveal } from "@/components/marketing/primitives";
import { TeamPortrait } from "@/components/brand/TeamPortrait";

interface Person {
  slug: string;
  name: string;
  role: string;
  bio: string;
  seed: number;
}

interface Group {
  title: string;
  lede: string;
  people: Person[];
}

const GROUPS: Group[] = [
  {
    title: "Leadership",
    lede: "The founding team that set out to make hiring fast, rigorous and fair.",
    people: [
      { slug: "humza-rafiq", name: "Humza Rafiq", role: "Founder & Head of Recruiting", bio: "Started Think5 to give every candidate a real interview and every company a shortlist worth reading. Leads the recruiting practices.", seed: 3 },
      { slug: "wiki-nas", name: "Wiki Nas", role: "Co-founder & Director, Talent Acquisition", bio: "Co-founded Think5 and runs talent acquisition end to end: sourcing strategy, the candidate pipeline and every shortlist that reaches a client.", seed: 7 },
      { slug: "elena-varga", name: "Elena Varga", role: "Co-founder & Chief Executive", bio: "Built two recruiting firms before Think5. Believes every candidate deserves a real interview.", seed: 11 },
      { slug: "marcus-oyelaran", name: "Marcus Oyelaran", role: "Co-founder & Chief Technology Officer", bio: "Previously led ML infrastructure at a frontier lab. Designed Aria's first interview engine.", seed: 47 },
      { slug: "sofia-lindqvist", name: "Sofia Lindqvist", role: "Chief People Officer", bio: "Twenty years placing executives across Europe and North America. Owns quality and candidate experience.", seed: 83 },
      { slug: "rahul-menon", name: "Rahul Menon", role: "Chief Operating Officer", bio: "Ran delivery for a global staffing group. Runs the engine that turns a brief into a shortlist in 48 hours.", seed: 29 },
      { slug: "claire-dubois", name: "Claire Dubois", role: "Chief Revenue Officer", bio: "Scaled go-to-market at two B2B SaaS companies from seed to Series C.", seed: 61 },
    ],
  },
  {
    title: "Recruiting practice leads",
    lede: "One lead per industry, each with a decade or more inside the sector they hire for.",
    people: [
      { slug: "tomas-ferreira", name: "Tomás Ferreira", role: "Head of IT & Engineering Recruiting", bio: "Former engineering manager. Hired 400+ engineers across backend, ML and infrastructure.", seed: 97 },
      { slug: "amaka-nwosu", name: "Amaka Nwosu", role: "Head of Healthcare Recruiting", bio: "Registered nurse turned recruiter. Credentialing, licensure and clinical fit, done properly.", seed: 19 },
      { slug: "jonas-weber", name: "Jonas Weber", role: "Head of Finance Recruiting", bio: "Ex-analyst at a bulge-bracket bank. Places quants, accountants and compliance leads.", seed: 73 },
      { slug: "hannah-mcallister", name: "Hannah McAllister", role: "Head of Construction Recruiting", bio: "Chartered quantity surveyor. Recruits site leadership, estimators and project managers.", seed: 41 },
      { slug: "diego-salazar", name: "Diego Salazar", role: "Head of Startup Recruiting", bio: "Founding recruiter at three venture-backed companies. Runs the embedded startup practice.", seed: 5 },
    ],
  },
  {
    title: "Platform & research",
    lede: "The team behind Aria, Nexus and Forge.",
    people: [
      { slug: "yuki-tanaka", name: "Yuki Tanaka", role: "Head of Product, Aria", bio: "Leads the AI interviewer: rubrics, proctoring, multilingual assessment.", seed: 53 },
      { slug: "samuel-adeyemi", name: "Samuel Adeyemi", role: "Head of AI Research", bio: "Publishes on expert-in-the-loop training and evaluation. Directs Think5 Research.", seed: 89 },
      { slug: "ingrid-holm", name: "Ingrid Holm", role: "Head of Data Operations, Forge", bio: "Runs expert data pipelines for frontier labs: QA, calibration and delivery.", seed: 37 },
      { slug: "leila-haddad", name: "Leila Haddad", role: "Head of Design", bio: "Shapes every surface a candidate or hiring manager touches.", seed: 67 },
      { slug: "owen-fitzgerald", name: "Owen Fitzgerald", role: "General Counsel & Compliance", bio: "Employment law, data protection and licensing across every market we operate in.", seed: 23 },
    ],
  },
];

export default function TeamPage() {
  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden pt-40 pb-16 md:pt-48 md:pb-24">
        <div className="dot-grid-light absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" aria-hidden="true" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Eyebrow className="mb-6">Team</Eyebrow>
              <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[88px]">
                The people behind <span className="italic text-graphite">the platform</span>.
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pb-3">
              <p className="text-[17px] leading-relaxed text-graphite">
                Recruiters who have hired inside the industries they serve, and engineers who have shipped AI at frontier
                labs. Seventeen people who own the outcome, not the process.
              </p>
            </div>
          </div>
          <Reveal className="mt-16 md:mt-20">
            <StatRow
              stats={[
                { value: "17", label: "Leadership team" },
                { value: "4", label: "Industry practices" },
                { value: "150+", label: "Countries hired in" },
                { value: "12", label: "Languages spoken" },
              ]}
            />
          </Reveal>
        </Container>
      </section>

      {/* Groups */}
      {GROUPS.map((g, gi) => (
        <section key={g.title} className="border-t border-stone py-20 md:py-28">
          <Container>
            <Reveal>
              <SectionTitle eyebrow={`0${gi + 1}`} title={g.title} lede={g.lede} />
            </Reveal>
            <ul className={gi === 0 ? "mt-14 grid gap-x-4 gap-y-12 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7" : "mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-5"}>
              {g.people.map((p, i) => (
                <Reveal key={p.slug} as="li" delay={i * 80}>
                  <TeamPortrait slug={p.slug} name={p.name} seed={p.seed} />
                  <h3 className="mt-5 font-display text-[24px] leading-none tracking-[-0.01em] text-ink">{p.name}</h3>
                  <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.12em] text-graphite">{p.role}</p>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">{p.bio}</p>
                </Reveal>
              ))}
            </ul>
          </Container>
        </section>
      ))}

      {/* Values */}
      <section className="border-t border-stone py-20 md:py-28">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="How we work" title={<>Own the <span className="italic text-graphite">outcome</span>.</>} />
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              { n: "01", t: "Every candidate gets a real interview", b: "No résumé triage by keyword. Aria interviews everyone who applies, and a human reads the report." },
              { n: "02", t: "Industry depth over generalist reach", b: "Each practice is led by someone who worked in that industry. Rubrics, licences and comp bands are specific." },
              { n: "03", t: "Fast because it is rigorous", b: "Structure is what makes 48-hour shortlists possible without lowering the bar." },
            ].map((v, i) => (
              <Reveal key={v.n} delay={i * 100} className="border-t border-ink/15 pt-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-[26px] leading-tight tracking-[-0.01em] text-ink">{v.t}</h3>
                  <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">{v.n}</span>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-graphite">{v.b}</p>
              </Reveal>
            ))}
          </div>
          <Link href="/contact" className="mt-12 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink underline-offset-4 hover:underline">
            We&apos;re hiring recruiters and engineers <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Container>
      </section>

      <CtaBand
        eyebrow="Work with us"
        title={
          <>
            Talk to the person who&apos;ll <span className="italic text-white/70">actually</span> run your search.
          </>
        }
        lede="Every engagement is led by a practice head, not handed to an account manager."
        primary={{ label: "Book a call", href: "/contact" }}
        secondary={{ label: "See how we recruit", href: "/recruitment" }}
      />
      <SiteFooter />
    </main>
  );
}

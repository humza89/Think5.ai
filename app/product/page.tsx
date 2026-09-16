"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Container, Eyebrow, StatRow, Reveal } from "@/components/marketing/primitives";
import { AriaAvatar } from "@/components/brand/AriaAvatar";
import { AriaMock } from "@/components/marketing/mocks/AriaMock";
import { NexusMock } from "@/components/marketing/mocks/NexusMock";
import { ForgeMock } from "@/components/marketing/mocks/ForgeMock";
import { cn } from "@/lib/utils";

const PRODUCTS = [
  {
    id: "aria",
    badge: "AI interviewer",
    name: "Aria",
    tagline: "Every candidate, interviewed live.",
    description:
      "An AI interviewer that runs structured technical and behavioural screens for every applicant — engineers, clinicians, analysts, site leads — in 50+ languages, in real time.",
    features: [
      "Adaptive follow-ups that probe depth, not keywords",
      "Industry rubrics: IT, healthcare, finance, construction",
      "Frontier-grade proctoring and anti-cheat detection",
      "Scored reports and recordings you compare side by side",
      "Multi-language support in 50+ languages",
      "Candidates in 150+ countries, top 1% pass rate",
    ],
    stats: [
      { value: "1,000+", label: "Daily interviews" },
      { value: "150+", label: "Countries" },
      { value: "50+", label: "Languages" },
      { value: "1%", label: "Acceptance rate" },
    ],
    Mock: AriaMock,
  },
  {
    id: "nexus",
    badge: "Matching engine",
    name: "Nexus",
    tagline: "The right person, on the right role, in 48 hours.",
    description:
      "A matching engine that pairs candidates with roles on verified skills, Aria scores and availability — across startups, enterprises and AI labs.",
    features: [
      "Skill-to-role matching on interview evidence, not keywords",
      "Credential and licence verification per industry",
      "Comp benchmarks and availability built into the shortlist",
      "24–48 hour shortlist turnaround",
      "Continuous quality scoring from real hiring outcomes",
    ],
    stats: [
      { value: "48h", label: "To shortlist" },
      { value: "4", label: "Core industries" },
      { value: "100+", label: "Domains covered" },
      { value: "99.7%", label: "Quality score" },
    ],
    Mock: NexusMock,
  },
  {
    id: "forge",
    badge: "Data operations",
    name: "Forge",
    tagline: "Expert intelligence, shipped as training data.",
    description:
      "The data operations platform behind our AI training business: it turns the vetted expert network into RLHF, SFT, evaluation and red-teaming datasets for frontier labs.",
    features: [
      "RLHF data pipelines for frontier models",
      "Supervised fine-tuning (SFT) workflows",
      "Red-teaming and safety evaluations",
      "Vision-language model (VLM) training data",
      "Multi-modal dataset creation",
      "Managed QA and delivery pipelines",
    ],
    stats: [
      { value: "10M+", label: "Data points" },
      { value: "99.7%", label: "Quality score" },
      { value: "24/7", label: "Operations" },
      { value: "6+", label: "Data modalities" },
    ],
    capabilities: [
      { label: "RLHF", description: "Reinforcement learning from human feedback" },
      { label: "VLMs", description: "Vision-language training data" },
      { label: "Reasoning", description: "Complex logical reasoning datasets" },
      { label: "Multi-modal", description: "Cross-modal understanding data" },
      { label: "SFT", description: "Supervised fine-tuning pipelines" },
      { label: "Red teaming", description: "Safety and adversarial testing" },
    ],
    Mock: ForgeMock,
  },
];

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader tone="light" />

      {/* Hero */}
      <section className="relative overflow-hidden pt-40 pb-20 md:pt-48 md:pb-28">
        <div className="dot-grid-light absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)]" aria-hidden="true" />
        <Container className="relative">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Eyebrow className="mb-6">Our platform</Eyebrow>
              <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[88px]">
                Three products. <br className="hidden md:block" />
                One <span className="italic text-graphite">intelligence</span> platform.
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pb-3">
              <p className="text-[17px] leading-relaxed text-graphite">
                Aria interviews, Nexus matches and Forge turns expertise into training data. Together they run recruiting for startups, enterprises and AI labs.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {PRODUCTS.map((p) => (
                  <a
                    key={p.id}
                    href={`#${p.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone bg-paper-2 px-4 text-[13px] font-medium text-ink transition-colors hover:border-ink"
                  >
                    {p.name} <ArrowUpRight className="h-3.5 w-3.5 text-graphite" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Products */}
      {PRODUCTS.map((p, i) => {
        const flip = i % 2 === 1;
        return (
          <section key={p.id} id={p.id} className="scroll-mt-20 border-t border-stone py-24 md:py-32">
            <Container>
              <Reveal className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
                <div className={cn("lg:col-span-5", flip ? "lg:order-2 lg:col-start-8" : "lg:col-start-1")}>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">0{i + 1}</span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-stone bg-paper-2 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {p.badge}
                    </span>
                  </div>
                  <div className="mt-6 flex items-end gap-5">
                    {p.id === "aria" && <AriaAvatar size={88} className="mb-1" />}
                    <h2 className="font-display text-[64px] leading-none tracking-[-0.02em] text-ink md:text-[96px]">{p.name}</h2>
                  </div>
                  <p className="mt-4 font-display text-[24px] leading-tight text-graphite md:text-[28px]">{p.tagline}</p>
                  <p className="mt-6 max-w-md text-[16px] leading-relaxed text-graphite">{p.description}</p>

                  <ul className="mt-10 divide-y divide-stone border-y border-stone">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 py-3.5 text-[15px] text-ink">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={cn("space-y-10 lg:col-span-7", flip ? "lg:order-1 lg:col-start-1" : "lg:col-start-6")}>
                  <p.Mock />
                  <StatRow stats={p.stats} />
                  {p.capabilities && (
                    <>
                      <ul className="grid gap-x-8 sm:grid-cols-2 md:grid-cols-3">
                        {p.capabilities.map((c) => (
                          <li key={c.label} className="border-t border-stone py-4">
                            <p className="font-display text-[22px] leading-none text-ink">{c.label}</p>
                            <p className="mt-1.5 text-[13px] text-graphite">{c.description}</p>
                          </li>
                        ))}
                      </ul>
                      <Link href="/ai-training" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink underline-offset-4 hover:underline">
                        Explore AI training data <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </>
                  )}
                </div>
              </Reveal>
            </Container>
          </section>
        );
      })}

      <CtaBand
        eyebrow="Ready when you are"
        title={
          <>
            See the platform <span className="italic text-white/70">in action</span>.
          </>
        }
        lede="Talk to our team about expert talent, custom data operations or an enterprise partnership."
        primary={{ label: "Book a demo", href: "/contact" }}
        secondary={{ label: "Read the research", href: "/research" }}
      />
      <SiteFooter />

    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, SectionTitle, Reveal } from "@/components/marketing/primitives";
import { AriaMock } from "@/components/marketing/mocks/AriaMock";
import { NexusMock } from "@/components/marketing/mocks/NexusMock";
import { ForgeMock } from "@/components/marketing/mocks/ForgeMock";
import { cn } from "@/lib/utils";

const PRODUCTS = [
  {
    id: "aria",
    badge: "AI interviewer",
    name: "Aria",
    description:
      "Conducts rigorous technical assessments in 50+ languages, vetting candidates across 150+ countries in real time.",
    points: ["Conversational probing across technical domains", "Frontier-grade proctoring and anti-cheat", "Real-time scoring and assessment reports"],
    Mock: AriaMock,
  },
  {
    id: "nexus",
    badge: "Matching engine",
    name: "Nexus",
    description:
      "Pairs elite domain experts with AI training projects on skills, verified experience and measured quality.",
    points: ["Skill-to-project matching in 24–48 hours", "Domain verification for PhDs, MDs, JDs and engineers", "Continuous, performance-based quality scoring"],
    Mock: NexusMock,
  },
  {
    id: "forge",
    badge: "Data operations",
    name: "Forge",
    description:
      "Turns expert human intelligence into high-quality datasets for RLHF, SFT, evaluations and red teaming.",
    points: ["RLHF and SFT pipelines for frontier models", "Vision-language and multi-modal datasets", "Managed QA and delivery, 24/7"],
    Mock: ForgeMock,
  },
];

export function Platform() {
  return (
    <section className="relative bg-paper py-24 md:py-32">
      <Container>
        <Reveal>
          <SectionTitle
            eyebrow="Platform"
            title={
              <>
                One platform. <span className="italic text-graphite">Three</span> engines.
              </>
            }
            lede="Aria, Nexus and Forge work together to source, vet and deploy elite experts for AI training at scale."
          />
        </Reveal>

        <div className="mt-20 space-y-28 md:mt-28 md:space-y-40">
          {PRODUCTS.map((p, i) => {
            const flip = i % 2 === 1;
            return (
              <Reveal key={p.id} className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
                <div className={cn("lg:col-span-5", flip ? "lg:order-2 lg:col-start-8" : "lg:col-start-1")}>
                  <p className="inline-flex items-center gap-2 rounded-full border border-stone bg-paper-2 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {p.badge}
                  </p>
                  <h3 className="mt-6 font-display text-[56px] leading-none tracking-[-0.02em] text-ink md:text-[72px]">{p.name}</h3>
                  <p className="mt-5 max-w-md text-[17px] leading-relaxed text-graphite">{p.description}</p>
                  <ul className="mt-8 divide-y divide-stone border-y border-stone">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-3 py-3.5 text-[15px] text-ink">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/product#${p.id}`} className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink underline-offset-4 hover:underline">
                    Explore {p.name} <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className={cn("lg:col-span-7", flip ? "lg:order-1 lg:col-start-1" : "lg:col-start-6")}>
                  <p.Mock />
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

export default Platform;

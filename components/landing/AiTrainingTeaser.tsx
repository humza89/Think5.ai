"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, Eyebrow, Reveal } from "@/components/marketing/primitives";
import { pill } from "@/components/marketing/styles";

const CAPS = ["RLHF", "SFT", "Evaluations", "Red teaming", "VLM data", "Reasoning"];

export function AiTrainingTeaser() {
  return (
    <section className="bg-paper pb-24 md:pb-32">
      <Container>
        <Reveal className="grain relative overflow-hidden rounded-[28px] border border-stone bg-paper-2 p-8 md:p-14">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <Eyebrow className="mb-5">AI training data</Eyebrow>
              <h2 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[56px]">
                The same vetted network also trains <span className="italic text-graphite">frontier</span> models.
              </h2>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-graphite">
                Labs use Think5 experts — MDs, JDs, PhDs and senior engineers — to produce preference data, evaluations
                and red-team findings. Forge runs the pipeline; Aria has already vetted the people.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {CAPS.map((c) => (
                  <span key={c} className="rounded-full border border-stone bg-paper px-3 py-1 text-[12px] text-ink">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5 lg:pl-8">
              <dl className="grid grid-cols-2 gap-6 border-t border-stone pt-6">
                {[
                  { v: "10M+", l: "Data points" },
                  { v: "99.7%", l: "Quality score" },
                  { v: "500+", l: "Expert contributors" },
                  { v: "24/7", l: "Operations" },
                ].map((s) => (
                  <div key={s.l}>
                    <dd className="font-display text-[40px] leading-none tracking-[-0.02em] text-ink">{s.v}</dd>
                    <dt className="mt-2 text-[12px] uppercase tracking-[0.12em] text-graphite">{s.l}</dt>
                  </div>
                ))}
              </dl>
              <Link href="/ai-training" className={`${pill.ink} mt-8`}>
                Explore AI training <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export default AiTrainingTeaser;

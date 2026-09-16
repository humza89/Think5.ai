"use client";

import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Container, Eyebrow, SectionTitle, Reveal } from "@/components/marketing/primitives";

const papers = [
  {
    category: "RLHF",
    title: "Expert-in-the-Loop: Scaling Human Feedback for Frontier Models",
    abstract:
      "We present a framework for integrating domain expert feedback into RLHF pipelines at scale, demonstrating that expert-curated preference data yields significantly stronger model alignment than crowd-sourced alternatives across reasoning, safety, and factuality benchmarks.",
    date: "January 2026",
  },
  {
    category: "Data Quality",
    title: "Quality at Scale: A Framework for Domain Expert Verification",
    abstract:
      "This paper introduces a multi-layered quality assurance methodology for human data operations, combining automated consistency checks with expert peer review to achieve 99.7% accuracy rates across 100+ knowledge domains.",
    date: "December 2025",
  },
  {
    category: "Infrastructure",
    title: "Multi-Modal Data Pipelines for Vision-Language Model Training",
    abstract:
      "We describe the architecture of a production data pipeline that enables domain experts to create, annotate, and validate multi-modal training data for vision-language models, reducing dataset preparation time by 60%.",
    date: "November 2025",
  },
  {
    category: "AI Safety",
    title: "Beyond Crowdsourcing: Why Domain Expertise Matters for AI Safety",
    abstract:
      "Through extensive experimentation, we show that red-teaming conducted by domain experts uncovers 3.2x more critical safety vulnerabilities compared to general crowd workers, with higher-severity findings across medical, legal, and financial domains.",
    date: "October 2025",
  },
  {
    category: "Evaluation",
    title: "Benchmarking Human Data Quality Across 150+ Countries",
    abstract:
      "We analyze data quality patterns from our global network of expert contributors, revealing that rigorous vetting and continuous performance tracking—not geography—are the primary predictors of output quality for AI training data.",
    date: "September 2025",
  },
  {
    category: "Research",
    title: "The Economics of High-Quality Training Data for Foundation Models",
    abstract:
      "An analysis of the cost-quality tradeoff in AI training data production, demonstrating that investing in expert-generated data yields 5-10x ROI compared to low-cost alternatives when measured by downstream model performance improvements.",
    date: "August 2025",
  },
];

const researchAreas = [
  {
    n: "01",
    title: "AI Recruitment & Vetting",
    description:
      "How AI can identify and assess domain experts at scale while maintaining rigorous quality standards. Our work on Aria explores conversational AI interviewing, multi-language assessment, and anti-fraud detection.",
  },
  {
    n: "02",
    title: "Human Data Quality",
    description:
      "Frameworks for measuring, validating, and ensuring the quality of human-generated training data. We study expert calibration, inter-annotator agreement, and performance-driven talent optimization.",
  },
  {
    n: "03",
    title: "Evaluation Frameworks",
    description:
      "Developing rigorous benchmarks and evaluation methods for AI systems trained on human feedback. Our research covers RLHF evaluation, safety testing methodologies, and domain-specific model assessment.",
  },
];

export default function ResearchPage() {
  const [featured, ...rest] = papers;

  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader tone="light" />

      {/* Hero */}
      <section className="pt-40 pb-16 md:pt-48 md:pb-24">
        <Container>
          <Eyebrow className="mb-6">Research</Eyebrow>
          <h1 className="max-w-5xl font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[88px]">
            Advancing the science of <span className="italic text-graphite">human–AI</span> collaboration.
          </h1>
          <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-graphite md:text-lg">
            Our research team explores how human intelligence shapes AI systems, publishing findings that push the
            boundaries of data quality, evaluation frameworks and expert-in-the-loop training.
          </p>
        </Container>
      </section>

      {/* Featured paper */}
      <section className="pb-20 md:pb-28">
        <Container>
          <Reveal>
            <article className="grain relative overflow-hidden rounded-[28px] border border-stone bg-paper-2 p-8 md:p-14">
              <div className="grid gap-10 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <Eyebrow>Featured · {featured.category}</Eyebrow>
                  <p className="mt-4 text-[13px] text-graphite">{featured.date}</p>
                  <a href="#" className="mt-10 hidden items-center gap-1.5 text-[15px] font-medium text-ink underline-offset-4 hover:underline lg:inline-flex">
                    Read paper <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
                <div className="lg:col-span-8">
                  <h2 className="font-display text-[36px] leading-[1.08] tracking-[-0.02em] text-ink md:text-[52px]">{featured.title}</h2>
                  <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-graphite">{featured.abstract}</p>
                  <a href="#" className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink underline-offset-4 hover:underline lg:hidden">
                    Read paper <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </article>
          </Reveal>
        </Container>
      </section>

      {/* Index */}
      <section className="border-t border-stone py-20 md:py-28">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="Publications" title="Selected publications" lede="Recent work from the Think5 research team." />
          </Reveal>
          <ol className="mt-14 border-t border-ink/15">
            {rest.map((paper, i) => (
              <Reveal key={paper.title} as="li" delay={i * 60} className="group border-b border-stone">
                <a href="#" className="grid gap-3 py-7 md:grid-cols-[140px_1fr_140px] md:items-baseline md:gap-8">
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">{paper.category}</span>
                  <div>
                    <h3 className="font-display text-[26px] leading-[1.15] tracking-[-0.01em] text-ink transition-colors group-hover:text-brand md:text-[32px]">
                      {paper.title}
                    </h3>
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-graphite">{paper.abstract}</p>
                  </div>
                  <span className="text-[13px] text-graphite md:text-right">{paper.date}</span>
                </a>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      {/* Areas */}
      <section className="border-t border-stone py-20 md:py-28">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="Research areas" title={<>Core focus areas driving our <span className="italic text-graphite">scientific</span> contributions.</>} />
          </Reveal>
          <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
            {researchAreas.map((area, i) => (
              <Reveal key={area.title} delay={i * 100} className="border-t border-ink/15 pt-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-[28px] leading-tight tracking-[-0.01em] text-ink">{area.title}</h3>
                  <span className="text-[12px] tabular-nums tracking-[0.18em] text-graphite">{area.n}</span>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-graphite">{area.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand
        eyebrow="Collaborate"
        title={
          <>
            Work with our <span className="italic text-white/70">research</span> team.
          </>
        }
        lede="We partner with labs and universities on data quality, evaluation and expert-in-the-loop training."
        primary={{ label: "Start a conversation", href: "/contact" }}
        secondary={{ label: "Explore the platform", href: "/product" }}
      />
      <SiteFooter />
    </main>
  );
}

"use client";

import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, FileText, BookOpen, FlaskConical } from "lucide-react";

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
    icon: BookOpen,
    title: "AI Recruitment & Vetting",
    description:
      "How AI can identify and assess domain experts at scale while maintaining rigorous quality standards. Our work on Aria explores conversational AI interviewing, multi-language assessment, and anti-fraud detection.",
  },
  {
    icon: FlaskConical,
    title: "Human Data Quality",
    description:
      "Frameworks for measuring, validating, and ensuring the quality of human-generated training data. We study expert calibration, inter-annotator agreement, and performance-driven talent optimization.",
  },
  {
    icon: FileText,
    title: "Evaluation Frameworks",
    description:
      "Developing rigorous benchmarks and evaluation methods for AI systems trained on human feedback. Our research covers RLHF evaluation, safety testing methodologies, and domain-specific model assessment.",
  },
];

const categoryColors: Record<string, string> = {
  RLHF: "text-purple-400 bg-purple-400/10",
  "Data Quality": "text-green-400 bg-green-400/10",
  Infrastructure: "text-blue-400 bg-blue-400/10",
  "AI Safety": "text-red-400 bg-red-400/10",
  Evaluation: "text-amber-400 bg-amber-400/10",
  Research: "text-cyan-400 bg-cyan-400/10",
};

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-black">
      <Header />

      {/* Hero */}
      <section className="pt-32 pb-24 bg-black relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-xs text-blue-400 uppercase tracking-widest mb-4">
              Research
            </p>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Advancing the science of human-AI collaboration
            </h1>
            <p className="text-lg text-white/60 max-w-2xl">
              Our research team explores how human intelligence shapes AI
              systems, publishing findings that push the boundaries of data
              quality, evaluation frameworks, and expert-in-the-loop training.
            </p>
          </div>
        </div>
      </section>

      {/* Research Papers */}
      <section className="py-24 bg-black relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="container mx-auto px-6">
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Featured Research
            </h2>
            <p className="text-white/50">
              Selected publications from the Think5 research team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {papers.map((paper, i) => (
              <article
                key={i}
                className="group rounded-2xl border border-white/10 bg-white/5 p-8 hover:bg-white/[0.07] transition-colors flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
                      categoryColors[paper.category] ||
                      "text-blue-400 bg-blue-400/10"
                    }`}
                  >
                    {paper.category}
                  </span>
                  <span className="text-xs text-white/30">{paper.date}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-blue-300 transition-colors">
                  {paper.title}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed flex-1">
                  {paper.abstract}
                </p>
                <div className="mt-6 pt-4 border-t border-white/10">
                  <span className="text-sm text-blue-400 group-hover:text-blue-300 transition-colors flex items-center gap-1">
                    Read paper <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Research Areas */}
      <section className="py-24 bg-black relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="container mx-auto px-6">
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Research Areas
            </h2>
            <p className="text-white/50">
              Core focus areas driving our scientific contributions.
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {researchAreas.map((area, i) => (
              <li key={i} className="min-h-[14rem] list-none">
                <div className="relative h-full rounded-2xl border border-white/10 p-2">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={2}
                  />
                  <div className="relative flex h-full flex-col overflow-hidden rounded-xl bg-zinc-950/80 p-8 backdrop-blur-sm">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                      <area.icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white tracking-tight mb-3">
                      {area.title}
                    </h3>
                    <div className="w-12 h-0.5 bg-blue-500/60 mb-3" />
                    <p className="text-sm leading-relaxed text-white/60">
                      {area.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl" />

              <div className="relative z-10">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-6">
                  Collaborate
                </p>
                <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
                  Interested in collaborating
                  <br />
                  on research?
                </h2>
                <p className="text-lg text-white/50 mb-10 max-w-2xl mx-auto">
                  We partner with leading AI labs and academic institutions to
                  advance the science of human-AI collaboration.
                </p>
                <Link href="/contact">
                  <Button
                    size="lg"
                    className="bg-white text-black hover:bg-white/90 rounded-full px-8 h-12"
                  >
                    Get in Touch
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

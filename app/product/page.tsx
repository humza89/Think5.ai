"use client";

import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Network,
  Database,
  Check,
  Globe,
  Shield,
  Zap,
  MessageSquare,
  Languages,
  BarChart3,
  Users,
  Clock,
  Star,
  Layers,
  FlaskConical,
  Eye,
  Boxes,
  FileCheck,
  Settings,
} from "lucide-react";

const products = [
  {
    id: "aria",
    badge: "AI Interviewer",
    name: "Aria",
    description:
      "AI-powered interviewer that conducts rigorous technical assessments, vetting candidates across 150+ countries in real time.",
    features: [
      { icon: MessageSquare, text: "Conversational probing across technical domains" },
      { icon: Languages, text: "Multi-language support in 50+ languages" },
      { icon: Shield, text: "Frontier-grade proctoring and anti-cheat detection" },
      { icon: BarChart3, text: "Real-time scoring and detailed assessment reports" },
      { icon: Globe, text: "Vetting candidates across 150+ countries" },
      { icon: Star, text: "Top 1% acceptance rate for elite talent" },
    ],
    stats: [
      { value: "1,000+", label: "Daily Interviews" },
      { value: "150+", label: "Countries" },
      { value: "50+", label: "Languages" },
      { value: "1%", label: "Acceptance Rate" },
    ],
  },
  {
    id: "nexus",
    badge: "Matching Engine",
    name: "Nexus",
    description:
      "Intelligent matching engine that pairs elite domain experts with AI training projects based on skills, experience, and quality metrics.",
    features: [
      { icon: Network, text: "AI-powered skill-to-project matching" },
      { icon: Users, text: "Domain expertise verification (PhDs, engineers, doctors, lawyers)" },
      { icon: BarChart3, text: "Performance-based quality scoring" },
      { icon: Clock, text: "24-48 hour matching turnaround" },
      { icon: Zap, text: "Continuous talent pool optimization" },
    ],
    stats: [
      { value: "500+", label: "Expert Contributors" },
      { value: "24-48h", label: "Matching Speed" },
      { value: "100+", label: "Domains Covered" },
      { value: "99.7%", label: "Quality Score" },
    ],
  },
  {
    id: "forge",
    badge: "Data Operations",
    name: "Forge",
    description:
      "End-to-end data operations platform that transforms expert human intelligence into high-quality datasets for RLHF, SFT, and evaluations.",
    features: [
      { icon: Layers, text: "RLHF data pipelines for frontier models" },
      { icon: FileCheck, text: "Supervised Fine-Tuning (SFT) workflows" },
      { icon: FlaskConical, text: "Red-teaming and safety evaluations" },
      { icon: Eye, text: "Vision Language Model (VLM) training data" },
      { icon: Boxes, text: "Multi-modal dataset creation" },
      { icon: Settings, text: "Managed QA and delivery pipelines" },
    ],
    stats: [
      { value: "10M+", label: "Data Points" },
      { value: "99.7%", label: "Quality Score" },
      { value: "24/7", label: "Operations" },
      { value: "6+", label: "Data Modalities" },
    ],
    capabilities: [
      { label: "RLHF", description: "Reinforcement Learning from Human Feedback" },
      { label: "VLMs", description: "Vision Language Models training data" },
      { label: "Reasoning", description: "Complex logical reasoning datasets" },
      { label: "Multi-Modal", description: "Cross-modal understanding data" },
      { label: "SFT", description: "Supervised Fine-Tuning pipelines" },
      { label: "Red Teaming", description: "Safety & adversarial testing" },
    ],
  },
];

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-black">
      <Header />

      {/* Hero */}
      <section className="pt-32 pb-24 bg-black relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-xs text-blue-400 uppercase tracking-widest mb-4">
              Our Platform
            </p>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Three products.
              <br />
              One intelligence platform.
            </h1>
            <p className="text-lg text-white/60 max-w-2xl">
              Aria, Nexus, and Forge work together to source, vet, and deploy
              elite experts for AI training at scale.
            </p>
          </div>
        </div>
      </section>

      {/* Product Sections */}
      {products.map((product, idx) => (
        <section
          key={product.id}
          id={product.id}
          className="py-24 bg-black relative overflow-hidden scroll-mt-24"
        >
          {/* Divider */}
          {idx > 0 && (
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          )}

          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              {/* Content */}
              <div className="space-y-8">
                <div>
                  <span className="inline-block px-3 py-1 text-xs font-medium text-blue-400 bg-blue-400/10 rounded-full mb-4">
                    {product.badge}
                  </span>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                    {product.name}
                  </h2>
                  <p className="text-lg text-white/60 max-w-lg">
                    {product.description}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-4">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-white/70 text-sm leading-relaxed pt-1">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Stats + Capabilities */}
              <div className="space-y-8">
                {/* Stats Grid */}
                <div className="relative rounded-2xl border border-white/10 p-2">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={2}
                  />
                  <div className="relative rounded-xl bg-zinc-950/80 p-8 backdrop-blur-sm">
                    <div className="grid grid-cols-2 gap-8">
                      {product.stats.map((stat, i) => (
                        <div key={i} className="text-center">
                          <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                            {stat.value}
                          </div>
                          <div className="text-xs text-white/40 uppercase tracking-wide">
                            {stat.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Capabilities (Forge only) */}
                {product.capabilities && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {product.capabilities.map((cap, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition-colors"
                      >
                        <div className="text-sm font-semibold text-white mb-1">
                          {cap.label}
                        </div>
                        <div className="text-xs text-white/40 leading-relaxed">
                          {cap.description}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl" />

              <div className="relative z-10">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-6">
                  Get Started
                </p>
                <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
                  Ready to build with Think5?
                </h2>
                <p className="text-lg text-white/50 mb-10 max-w-2xl mx-auto">
                  Get in touch to learn how our platform can accelerate your AI
                  training with elite human intelligence.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/contact">
                    <Button
                      size="lg"
                      className="bg-white text-black hover:bg-white/90 rounded-full px-8 h-12"
                    >
                      Get in Touch
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full px-8 h-12 border-white/20 text-white hover:bg-white/10 bg-transparent"
                    >
                      Join as Expert
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

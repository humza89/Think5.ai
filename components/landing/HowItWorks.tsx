"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  UserCheck,
  Briefcase,
  BarChart3,
} from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      number: "01",
      icon: Search,
      title: "AI Sources Experts",
      description: "Our AI engine identifies and reaches out to top experts across every domain — PhDs, engineers, doctors, lawyers, and specialists.",
    },
    {
      number: "02",
      icon: UserCheck,
      title: "Aria Vets Candidates",
      description: "Our AI interviewer conducts rigorous technical assessments. Only the top 1% of applicants make it into our network.",
    },
    {
      number: "03",
      icon: Briefcase,
      title: "Deploy to Projects",
      description: "Matched experts are deployed to your AI training projects — RLHF, evaluations, red-teaming, or custom data work.",
    },
    {
      number: "04",
      icon: BarChart3,
      title: "Managed QA & Delivery",
      description: "We handle quality assurance, performance tracking, payroll, and compliance. You get high-quality training data, guaranteed.",
    },
  ];

  return (
    <section className="py-24 bg-neutral-950">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
            How it works
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
            End-to-end human data
            <br />
            operations platform
          </h2>
          <p className="text-lg text-white/50">
            We don&apos;t just connect you with experts. We manage the entire workflow from sourcing to delivery.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {steps.map((step) => (
            <Card key={step.number} className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4">
                  <step.icon className="w-6 h-6 text-white/70" />
                </div>
                <div className="text-sm font-medium text-white/30 mb-2">{step.number}</div>
                <CardTitle className="text-lg text-white font-light">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/50 leading-relaxed">
                  {step.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Row */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-light text-white mb-2">1,000+</p>
              <p className="text-white/50">Interviews Daily</p>
            </div>
            <div>
              <p className="text-4xl font-light text-white mb-2">1%</p>
              <p className="text-white/50">Acceptance Rate</p>
            </div>
            <div>
              <p className="text-4xl font-light text-white mb-2">24-48h</p>
              <p className="text-white/50">Matching Time</p>
            </div>
            <div>
              <p className="text-4xl font-light text-white mb-2">150+</p>
              <p className="text-white/50">Countries Covered</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

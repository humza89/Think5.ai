"use client";

import Image from "next/image";

const features = [
  {
    name: "Aria",
    description:
      "AI-powered interviewer that conducts rigorous technical assessments, vetting candidates across 150+ countries in real time",
  },
  {
    name: "Nexus",
    description:
      "Intelligent matching engine that pairs elite domain experts with AI training projects based on skills, experience, and quality metrics",
  },
  {
    name: "Forge",
    description:
      "End-to-end data operations platform that transforms expert human intelligence into high-quality datasets for RLHF, SFT, and evaluations",
  },
];

const IntelligencePlatform = () => {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="mb-20">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Intelligence Platform
          </h2>
          <p className="text-lg text-white/50">
            The human intelligence infrastructure for AGI
          </p>
        </div>

        {/* Central Visual */}
        <div className="relative flex justify-center">
          <div className="relative w-full max-w-3xl aspect-[16/10]">
            <Image
              src="/uploads/Think5 Intelligence platform image.png"
              alt="Think5 Intelligence Platform"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </div>

        {/* Feature Cards with Connectors */}
        <div className="grid md:grid-cols-3 gap-0 max-w-5xl mx-auto -mt-28">
          {features.map((feature, index) => (
            <div key={feature.name} className="flex flex-col items-center text-center px-6">
              {/* Dotted connector line */}
              <div
                className="w-px h-16 border-l-2 border-dashed border-white/20 mb-6"
              />

              {/* Connector dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-white/40 mb-5" />

              {/* Card content */}
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.name}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed max-w-xs">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default IntelligencePlatform;

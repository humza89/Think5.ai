"use client";

import { SplineScene } from "@/components/ui/spline-scene";
import { Spotlight } from "@/components/ui/spotlight";
import { GlowCard } from "@/components/ui/spotlight-card";

const dataCapabilities = [
  {
    label: "RLHF",
    description: "Reinforcement Learning from Human Feedback",
  },
  {
    label: "VLMs",
    description: "Vision Language Models training data",
  },
  {
    label: "Reasoning",
    description: "Complex logical reasoning datasets",
  },
  {
    label: "Multi-Modal",
    description: "Cross-modal understanding data",
  },
  {
    label: "SFT",
    description: "Supervised Fine-Tuning pipelines",
  },
  {
    label: "Red Teaming",
    description: "Safety & adversarial testing",
  },
];

const stats = [
  { value: "10M+", label: "Data points processed" },
  { value: "500+", label: "Expert contributors" },
  { value: "99.7%", label: "Quality score" },
  { value: "24/7", label: "Global operations" },
];

const Infrastructure = () => {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="rgba(59, 130, 246, 0.15)"
      />

      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="mb-16">
          <p className="text-xs text-blue-400 uppercase tracking-widest mb-4">
            Infrastructure
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            The talent and data infrastructure for AGI
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Side - Content */}
          <div className="space-y-8">
            {/* Data Engine Header */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-blue-500/50 to-transparent" />
              <span className="text-xs text-blue-400 uppercase tracking-widest">Data Engine</span>
            </div>

            {/* Main Hero Card */}
            <GlowCard
              glowColor="blue"
              customSize
              className="w-full h-auto !aspect-auto"
            >
              <div className="flex flex-col z-10 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">Live Operations</span>
                </div>

                <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Powering AGI
                </h3>

                <p className="text-white/60 text-base leading-relaxed mb-6 max-w-lg">
                  End-to-end human data operations converting human intelligence into high quality datasets that power the next generation of AI systems.
                </p>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-white/10">
                  {stats.map((stat, index) => (
                    <div key={index} className="text-center">
                      <div className="text-2xl md:text-3xl font-bold text-white mb-1">
                        {stat.value}
                      </div>
                      <div className="text-xs text-white/40 uppercase tracking-wide">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlowCard>

            {/* Capabilities Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {dataCapabilities.map((item, index) => (
                <GlowCard
                  key={index}
                  glowColor="blue"
                  customSize
                  className="!aspect-auto !p-0 !gap-0 !grid-rows-1 group"
                >
                  <div className="p-4 z-10">
                    <div className="text-sm font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                      {item.label}
                    </div>
                    <div className="text-xs text-white/40 leading-relaxed">
                      {item.description}
                    </div>
                  </div>
                </GlowCard>
              ))}
            </div>

            {/* Enterprise Badge */}
            <div className="flex items-center gap-4 pt-4">
              <div className="flex -space-x-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border-2 border-black flex items-center justify-center text-xs text-white/60"
                  >
                    {["O", "A", "G", "M"][i]}
                  </div>
                ))}
              </div>
              <div className="text-sm text-white/50">
                Trusted by leading AI labs worldwide
              </div>
            </div>
          </div>

          {/* Right Side - 3D Robot */}
          <div className="relative h-[600px] lg:h-[700px]">
            <div className="w-full h-full [filter:brightness(1.5)_saturate(0)_contrast(1.1)]">
              <SplineScene
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Infrastructure;

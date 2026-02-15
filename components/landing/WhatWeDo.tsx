"use client";

import { GlowingEffect } from "@/components/ui/glowing-effect";

const WhatWeDo = () => {
  const cards = [
    {
      title: "Human Intelligence Powers AI",
      description:
        "think5 transforms human brilliance into the driving force behind the world's most ambitious AI systems.",
    },
    {
      title: "Data That Defines Breakthroughs",
      description:
        "A model is only as good as its data. Beneath every AI breakthrough lies an orchestra of human expertise powering that data.",
    },
    {
      title: "Orchestrating Elite Expertise",
      description:
        "think5 conducts that orchestra—finding the sharpest minds and forging their expertise into datasets that shape how AI reasons, adapts, and evolves.",
    },
    {
      title: "Building Tomorrow's Intelligence",
      description:
        "We bridge the gap between raw human knowledge and machine learning, accelerating the path from expert insight to AI capability at unprecedented scale.",
    },
    {
      title: "Quality at Scale",
      description:
        "Every dataset we produce undergoes rigorous validation by domain experts, ensuring the highest standards of accuracy and relevance for AI training.",
    },
    {
      title: "Global Talent Network",
      description:
        "Access a curated network of PhDs, researchers, and industry specialists from around the world, ready to contribute their expertise to your AI projects.",
    },
  ];

  return (
    <section className="py-12 bg-black">
      <div className="container mx-auto px-6">
        {/* Section Header - Full left aligned */}
        <div className="mb-16">
          <p className="text-xs text-blue-400 uppercase tracking-widest mb-4">
            What We Do
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Powering AI with Human Intelligence
          </h2>
          <p className="text-lg text-white/60 max-w-2xl">
            We source, vet, and deploy elite experts to train the world&apos;s most advanced AI systems.
          </p>
        </div>

        {/* Grid of Cards */}
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {cards.map((card, index) => (
            <GridItem
              key={index}
              title={card.title}
              description={card.description}
            />
          ))}
        </ul>
      </div>
    </section>
  );
};

interface GridItemProps {
  title: string;
  description: string;
}

const GridItem = ({ title, description }: GridItemProps) => {
  return (
    <li className="min-h-[12rem] list-none">
      <div className="relative h-full rounded-2xl border border-white/10 p-2">
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={2}
        />
        <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-xl bg-zinc-950/80 p-6 backdrop-blur-sm">
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-semibold text-white tracking-tight mb-3">
                {title}
              </h3>
              <div className="w-12 h-0.5 bg-blue-500/60" />
            </div>
            <p className="text-sm leading-relaxed text-white/60 pt-1">
              {description}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
};

export default WhatWeDo;

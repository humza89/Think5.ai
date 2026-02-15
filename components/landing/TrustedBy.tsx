"use client";

import Image from "next/image";
import { Marquee } from "@/components/ui/marquee";

const logos = [
  { name: "OpenAI", src: "/Logos/openai-logo-0.png" },
  { name: "Anthropic", src: "/Logos/anthropic-logo.webp" },
  { name: "Google DeepMind", src: "/Logos/google-deepmind-logo.png" },
  { name: "Meta", src: "/Logos/png-clipart-meta-horizontal-logo-social-media-icons.png" },
  { name: "Microsoft", src: "/Logos/png-clipart-microsoft-logo-company-microsoft-company-text-thumbnail.png" },
  { name: "Netflix", src: "/Logos/png-clipart-netflix-logo-illustration-netflix-streaming-media-television-show-logo-netflix-logo-television-text.png" },
  { name: "Cohere", src: "/Logos/Cohere_Logo_2023.png" },
  { name: "Stability AI", src: "/Logos/stability-ai-tojrcvgxoppi2i0h4fggv.webp" },
  { name: "Runway", src: "/Logos/Runway_Logo.png" },
];

const TrustedBy = () => {
  return (
    <section className="py-16 bg-black border-b border-white/10">
      <div className="container mx-auto px-6">
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

          <Marquee pauseOnHover className="[--duration:35s] [--gap:5rem]">
            {logos.map((logo) => (
              <div
                key={logo.name}
                className="flex items-center justify-center h-12 px-4"
              >
                <Image
                  src={logo.src}
                  alt={logo.name}
                  width={120}
                  height={40}
                  className="h-8 w-auto object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300 invert"
                  unoptimized
                />
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;

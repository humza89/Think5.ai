"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import Header from "@/components/layout/Header";

const HeroSection = () => {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  // 15 candidates for falling balls - 6 second delay between each
  const candidateData = [
    { name: "Sarah Chen", role: "ML Engineer", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" },
    { name: "James Wilson", role: "PhD Physics", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop" },
    { name: "Maria Garcia", role: "Data Scientist", image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop" },
    { name: "Alex Kumar", role: "AI Researcher", image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" },
    { name: "Emily Zhang", role: "NLP Expert", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop" },
    { name: "David Park", role: "Computer Vision", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop" },
    { name: "Lisa Wang", role: "ML Ops Engineer", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" },
    { name: "Tom Brown", role: "Research Engineer", image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop" },
    { name: "Anna Lee", role: "PhD Mathematics", image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop" },
    { name: "Michael Chen", role: "Deep Learning", image: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100&h=100&fit=crop" },
    { name: "Sophie Taylor", role: "AI Safety", image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&h=100&fit=crop" },
    { name: "Ryan Kim", role: "Robotics Engineer", image: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop" },
    { name: "Jessica Wu", role: "PhD Linguistics", image: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=100&h=100&fit=crop" },
    { name: "Daniel Smith", role: "Systems Architect", image: "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=100&h=100&fit=crop" },
    { name: "Rachel Green", role: "ML Researcher", image: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=100&h=100&fit=crop" },
  ];

  // Fixed positions to avoid hydration mismatch (offset from center 55%)
  const positions = [-35, 25, -15, 30, -25, 20, -40, 10, -20, 35, -30, 15, -10, 40, -45];

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  return (
    <section className="relative h-[150vh] w-full overflow-hidden bg-black">
      {/* Video Background with mix-blend-screen - positioned lower */}
      <div className="absolute inset-x-0 top-[5%] bottom-0 w-full">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-100 mix-blend-screen"
          style={{ objectFit: 'cover', objectPosition: 'center top' }}
        >
          <source src="/uploads/hero.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Top black area + gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-[15%] bg-gradient-to-b from-black via-black/80 to-transparent z-[1]" />

      {/* Falling Candidate Balls - All move towards robot on right */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 15 }, (_, i) => {
          const candidate = candidateData[i];

          return (
            <div key={i}>
              {/* Ball with candidate image */}
              <div
                className="absolute w-14 h-14 rounded-full overflow-hidden animate-fall-to-robot opacity-0 shadow-lg shadow-blue-500/20"
                style={{
                  left: `calc(55% + ${positions[i]}px)`,
                  animationDelay: `${i * 6}s`,
                }}
              >
                <img
                  src={candidate.image}
                  alt={candidate.name}
                  className="w-full h-full object-cover"
                />
                {/* Glow ring around ball */}
                <div className="absolute inset-0 rounded-full ring-2 ring-blue-400/30" />
              </div>

              {/* Info Card - appears during pause phase */}
              <div
                className="absolute opacity-0 animate-card-show"
                style={{
                  left: `calc(55% + ${positions[i]}px + 70px)`,
                  top: '50vh',
                  animationDelay: `${i * 6}s`,
                }}
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 whitespace-nowrap">{candidate.name}</h3>
                    <p className="text-xs text-gray-500 whitespace-nowrap">{candidate.role}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Header Component */}
      <Header />

      {/* Hero Content - Left aligned like Hirview */}
      <div className="relative z-10 h-full flex items-start pt-[15%]">
        <div className="max-w-2xl ml-[120px]">
          {/* Main Headline */}
          <h1 className="text-6xl md:text-7xl font-bold text-white leading-[1.1] tracking-tight mb-6 animate-fade-in-up">
            The AI Platform for
            <br />
            Human Intelligence
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-300 mb-10 max-w-xl animate-fade-in-up delay-300">
            Sourcing, vetting, and deploying elite experts to train the world&apos;s most advanced AI systems.
          </p>

          {/* CTA Button with Sun Glow Effect */}
          <button
            onMouseMove={handleMouseMove}
            className="relative px-8 py-4 bg-gray-200 text-black rounded-full font-medium text-lg overflow-hidden group animate-fade-in-up delay-500"
          >
            {/* Sun glow effect that follows cursor */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,180,50,0.6) 0%, rgba(255,120,50,0.3) 30%, transparent 60%)`,
              }}
            />
            <span className="relative z-10 flex items-center gap-2">
              Get Started
              <ChevronRight className="w-5 h-5" />
            </span>
          </button>
        </div>
      </div>

    </section>
  );
};

export default HeroSection;

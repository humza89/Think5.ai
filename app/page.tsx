import HeroSection from "@/components/landing/HeroSection";
import TrustedBy from "@/components/landing/TrustedBy";
import WhatWeDo from "@/components/landing/WhatWeDo";
import Infrastructure from "@/components/landing/Infrastructure";
import HowItWorks from "@/components/landing/HowItWorks";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <TrustedBy />
      <WhatWeDo />
      <Infrastructure />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}

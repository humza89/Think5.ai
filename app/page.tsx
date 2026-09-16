import HeroSection from "@/components/landing/HeroSection";
import { LogoWall } from "@/components/marketing/LogoWall";
import { Manifesto } from "@/components/landing/Manifesto";
import { Platform } from "@/components/landing/Platform";
import { DataEngine } from "@/components/landing/DataEngine";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Quote } from "@/components/landing/Quote";
import { CtaBand } from "@/components/marketing/CtaBand";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export default function Home() {
  return (
    <main className="min-h-screen bg-paper">
      <HeroSection />
      <LogoWall tone="dark" />
      <Manifesto />
      <Platform />
      <DataEngine />
      <HowItWorks />
      <Quote />
      <CtaBand
        title={
          <>
            Ready to build the future of AI <span className="italic text-white/70">with us</span>?
          </>
        }
        lede="Whether you need expert talent for AI training or want to join our network, we're here to help."
        primary={{ label: "Find expert talent", href: "/contact" }}
        secondary={{ label: "Join as an expert", href: "/auth/signup" }}
      />
      <SiteFooter />
    </main>
  );
}

import HeroSection from "@/components/landing/HeroSection";
import { LogoWall } from "@/components/marketing/LogoWall";
import { Manifesto } from "@/components/landing/Manifesto";
import { Industries } from "@/components/landing/Industries";
import { Platform } from "@/components/landing/Platform";
import { AiTrainingTeaser } from "@/components/landing/AiTrainingTeaser";
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
      <Industries />
      <Platform />
      <AiTrainingTeaser />
      <HowItWorks />
      <Quote />
      <CtaBand
        title={
          <>
            Ready to make your next hire the <span className="italic text-white/70">right</span> one?
          </>
        }
        lede="Whether you're a founder making a first hire, an enterprise scaling a team, or a lab that needs expert data, we're here to help."
        primary={{ label: "Book a call", href: "/contact" }}
        secondary={{ label: "Join as a candidate", href: "/auth/signup" }}
      />
      <SiteFooter />
    </main>
  );
}

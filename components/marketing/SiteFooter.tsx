import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "./primitives";

const FOOTER_LINKS: Record<string, { name: string; href: string }[]> = {
  Platform: [
    { name: "Product", href: "/product" },
    { name: "Recruitment", href: "/recruitment" },
    { name: "Aria", href: "/product#aria" },
    { name: "Nexus", href: "/product#nexus" },
    { name: "Forge", href: "/product#forge" },
    { name: "AI training data", href: "/ai-training" },
  ],
  Company: [
    { name: "Team", href: "/team" },
    { name: "Careers", href: "/careers" },
    { name: "Blog", href: "/blog" },
    { name: "Research", href: "/research" },
  ],
  Resources: [
    { name: "Documentation", href: "/docs" },
    { name: "Case Studies", href: "/case-studies" },
    { name: "Contact", href: "/contact" },
    { name: "Support", href: "/contact" },
  ],
  Legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Security", href: "/security" },
    { name: "Compliance", href: "/compliance" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      <Container className="relative">
        {/* Tagline row */}
        <div className="grid gap-10 border-b border-white/10 py-16 md:grid-cols-12 md:py-20">
          <div className="md:col-span-7">
            <Logo tone="light" withMark />
            <p className="mt-8 max-w-xl font-display text-[36px] leading-[1.05] tracking-[-0.02em] md:text-[52px]">
              Human intelligence, <span className="italic text-white/70">organised</span> for the age of AI.
            </p>
          </div>
          <div className="md:col-span-5 md:pt-2">
            <p className="max-w-sm text-[15px] leading-relaxed text-white/55">
              AI-powered recruiting for startups and enterprises across IT, healthcare, finance and construction, plus the expert network that trains frontier AI.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              <a href="https://twitter.com/think5ai" className="text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline">X / Twitter</a>
              <a href="https://linkedin.com/company/think5ai" className="text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline">LinkedIn</a>
              <a href="https://github.com/think5ai" className="text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline">GitHub</a>
            </div>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 py-14 md:grid-cols-4">
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">{category}</h3>
              <ul className="mt-5 space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-[15px] text-white/75 transition-colors hover:text-white">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-4 border-t border-white/10 py-8 text-[13px] text-white/40 md:flex-row md:items-center">
          <p>&copy; {new Date().getFullYear()} Think5. All rights reserved.</p>
          <Link href="/status" className="inline-flex items-center gap-2 transition-colors hover:text-white/70">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            All systems operational
          </Link>
        </div>
      </Container>

      {/* Oversized watermark */}
      <div aria-hidden="true" className="pointer-events-none select-none absolute -bottom-10 right-0 font-display text-[28vw] leading-none tracking-[-0.05em] text-white/[0.025] md:-bottom-16">
        think5
      </div>
    </footer>
  );
}

export default SiteFooter;

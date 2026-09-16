import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, Eyebrow } from "./primitives";
import { pill } from "./styles";
import { cn } from "@/lib/utils";

interface CtaLink {
  label: string;
  href: string;
}

interface CtaBandProps {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: string;
  primary: CtaLink;
  secondary?: CtaLink;
  className?: string;
}

export function CtaBand({ eyebrow = "Get started", title, lede, primary, secondary, className }: CtaBandProps) {
  return (
    <section className={cn("relative overflow-hidden bg-ink py-24 text-white md:py-32", className)}>
      <div className="dot-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden="true" />
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tone="dark" className="mb-6 justify-center">{eyebrow}</Eyebrow>
          <h2 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] md:text-[72px]">{title}</h2>
          {lede && <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-white/60">{lede}</p>}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={primary.href} className={pill.paper}>
              {primary.label} <ArrowUpRight className="h-4 w-4" />
            </Link>
            {secondary && (
              <Link href={secondary.href} className={pill.ghostDark}>
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default CtaBand;

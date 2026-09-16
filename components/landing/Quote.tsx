"use client";

import { Container, Reveal } from "@/components/marketing/primitives";

export function Quote() {
  return (
    <section className="bg-paper pb-24 md:pb-32">
      <Container>
        <Reveal className="mx-auto max-w-4xl border-y border-ink/15 py-16 text-center md:py-24">
          <span className="font-display text-[80px] leading-[0.5] text-brand" aria-hidden="true">
            &ldquo;
          </span>
          <blockquote className="mt-6 font-display text-[30px] leading-[1.15] tracking-[-0.01em] text-ink md:text-[44px]">
            We had three founding engineers signed in five weeks. Every candidate Think5 sent had already been through
            a real technical interview, so our team only spoke to people worth speaking to.
          </blockquote>
          <figcaption className="mt-8 text-[14px] text-graphite">
            <span className="font-medium text-ink">Sarah Chen</span> · Co-founder &amp; CTO, seed-stage AI startup
          </figcaption>
        </Reveal>
      </Container>
    </section>
  );
}

export default Quote;

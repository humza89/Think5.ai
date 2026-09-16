"use client";

import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Container, Eyebrow, pill } from "@/components/marketing/primitives";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const helpOptions = [
  "Hire for my startup",
  "Enterprise recruiting",
  "AI training data",
  "Enterprise partnership",
  "Research collaboration",
  "Other",
];

const helpWith = [
  "Embedded recruiting for startups, first hire onwards",
  "Roles across IT, healthcare, finance and construction",
  "AI training data operations (RLHF, SFT, evaluations)",
  "Enterprise partnerships and research collaborations",
];

const field =
  "h-12 rounded-xl border-stone bg-paper-2 px-4 text-[15px] text-ink placeholder:text-graphite/70 focus-visible:border-ink focus-visible:ring-0 focus-visible:ring-offset-0";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader tone="light" />

      <section className="pt-36 pb-24 md:pt-44 md:pb-32">
        <Container>
          <div className="grid gap-16 lg:grid-cols-12 lg:gap-12">
            {/* Left */}
            <div className="lg:col-span-5">
              <Eyebrow className="mb-6">Contact</Eyebrow>
              <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[80px]">
                Let&apos;s <span className="italic text-graphite">talk</span>.
              </h1>
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-graphite">
                Whether you&apos;re making a first hire, scaling a team across industries, or need expert data for a
                frontier model, we&apos;d love to hear from you.
              </p>

              <div className="mt-12">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-graphite">What we can help with</p>
                <ul className="mt-4 divide-y divide-stone border-y border-stone">
                  {helpWith.map((item) => (
                    <li key={item} className="flex items-start gap-3 py-3.5 text-[15px] text-ink">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="mt-12 grid grid-cols-2 gap-8">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-graphite">Email</dt>
                  <dd className="mt-2">
                    <a href="mailto:contact@think5.ai" className="font-display text-[22px] text-ink underline-offset-4 hover:underline">
                      contact@think5.ai
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-graphite">Office</dt>
                  <dd className="mt-2 font-display text-[22px] text-ink">San Francisco, CA</dd>
                </div>
              </dl>

              <p className="mt-12 text-[12px] text-graphite">SOC 2 Type II certified · Enterprise-grade security</p>
            </div>

            {/* Right: form */}
            <div className="lg:col-span-7">
              <div className="rounded-[28px] border border-stone bg-paper-2 p-6 shadow-[0_30px_80px_-40px_rgba(10,10,11,0.25)] md:p-10">
                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white">
                      <Check className="h-6 w-6" />
                    </div>
                    <h2 className="mt-6 font-display text-[36px] leading-tight text-ink">Thanks, we&apos;ll be in touch.</h2>
                    <p className="mt-3 max-w-sm text-[15px] text-graphite">
                      Thank you for reaching out. Our team will get back to you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-[13px] text-ink">Name</Label>
                        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className={field} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-[13px] text-ink">Email</Label>
                        <Input id="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={field} />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="company" className="text-[13px] text-ink">Company</Label>
                        <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company name" className={field} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] text-ink">How can we help?</Label>
                        <Select value={topic} onValueChange={setTopic}>
                          <SelectTrigger className={cn(field, "[&>span]:text-left data-[placeholder]:text-graphite/70")}>
                            <SelectValue placeholder="Select a topic" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-stone bg-paper-2">
                            {helpOptions.map((option) => (
                              <SelectItem key={option} value={option} className="text-ink focus:bg-paper">
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-[13px] text-ink">Message</Label>
                      <Textarea
                        id="message"
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us about your project or needs…"
                        rows={6}
                        className="resize-none rounded-xl border-stone bg-paper-2 px-4 py-3 text-[15px] text-ink placeholder:text-graphite/70 focus-visible:border-ink focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>

                    <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[12px] text-graphite">We reply within one business day.</p>
                      <button type="submit" className={cn(pill.ink, "w-full sm:w-auto")}>
                        Send message <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}

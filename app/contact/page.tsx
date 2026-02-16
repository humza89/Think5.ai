"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MapPin,
  ArrowRight,
  Check,
  Shield,
  Building2,
} from "lucide-react";

const helpOptions = [
  "Hire expert talent",
  "Data operations",
  "Enterprise partnership",
  "Research collaboration",
  "Other",
];

const helpWith = [
  "Expert talent sourcing for AI training",
  "Custom data operations (RLHF, SFT, evaluations)",
  "Enterprise partnerships",
  "Research collaborations",
];

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
    <main className="min-h-screen bg-black">
      <Header />

      <section className="pt-32 pb-24 bg-black relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left — Info */}
            <div className="space-y-10">
              <div>
                <p className="text-xs text-blue-400 uppercase tracking-widest mb-4">
                  Contact
                </p>
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
                  Get in Touch
                </h1>
                <p className="text-lg text-white/60 max-w-lg">
                  Whether you need expert talent for AI training or want to
                  explore how Think5 can power your data operations, we&apos;d
                  love to hear from you.
                </p>
              </div>

              {/* Contact details */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white/40">Email</p>
                    <p className="text-white">contact@think5.ai</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white/40">Location</p>
                    <p className="text-white">San Francisco, CA</p>
                  </div>
                </div>
              </div>

              {/* What we help with */}
              <div>
                <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">
                  What we can help with
                </h3>
                <ul className="space-y-3">
                  {helpWith.map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="text-white/70 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-white/40">
                  <Shield className="w-4 h-4" />
                  <span className="text-xs">SOC 2 Type II Certified</span>
                </div>
                <div className="flex items-center gap-2 text-white/40">
                  <Building2 className="w-4 h-4" />
                  <span className="text-xs">Enterprise-Grade Security</span>
                </div>
              </div>
            </div>

            {/* Right — Form */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 md:p-10">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-6">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">
                    Message Sent
                  </h3>
                  <p className="text-white/50 max-w-sm">
                    Thank you for reaching out. Our team will get back to you
                    within 24 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label className="text-white/80 mb-2 block">Name</Label>
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-white/80 mb-2 block">Email</Label>
                    <Input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-white/80 mb-2 block">Company</Label>
                    <Input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Your company name"
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-white/80 mb-2 block">
                      How can we help?
                    </Label>
                    <Select value={topic} onValueChange={setTopic}>
                      <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl [&>span]:text-white/40 data-[state=open]:border-blue-500/50">
                        <SelectValue placeholder="Select a topic" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10">
                        {helpOptions.map((option) => (
                          <SelectItem
                            key={option}
                            value={option}
                            className="text-white focus:bg-white/10 focus:text-white"
                          >
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-white/80 mb-2 block">Message</Label>
                    <Textarea
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us about your project or needs..."
                      rows={5}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl h-12"
                  >
                    Send Message
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

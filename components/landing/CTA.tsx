"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 bg-black">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Main CTA Card */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center relative overflow-hidden">
            {/* Subtle gradient accents */}
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-white/5 rounded-full filter blur-3xl"></div>

            <div className="relative z-10">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-6">
                Get Started Today
              </p>

              <h2 className="text-4xl md:text-5xl font-light text-white mb-6">
                Ready to build the future
                <br />
                of AI with us?
              </h2>

              <p className="text-lg text-white/50 mb-10 max-w-2xl mx-auto">
                Whether you need expert talent for AI training or want to join our elite network, we&apos;re here to help.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/get-started">
                  <Button size="lg" className="bg-white text-black hover:bg-white/90 rounded-full px-8 h-12">
                    Find Expert Talent
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/join">
                  <Button size="lg" variant="outline" className="rounded-full px-8 h-12 border-white/20 text-white hover:bg-white/10 bg-transparent">
                    Join as Expert
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Newsletter Section */}
          <div className="mt-16 text-center">
            <p className="text-white/50 mb-4">
              Sign up for our newsletter to hear our latest scientific and product updates.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
              <div className="relative flex-1 w-full">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10 h-12 rounded-full bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-white/30"
                />
              </div>
              <Button className="bg-white hover:bg-white/90 text-black rounded-full h-12 px-6">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;

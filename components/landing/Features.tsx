"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const Features = () => {
  return (
    <section className="py-24 bg-black">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-20">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
            What we do
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white leading-tight">
            We transform human expertise into AI training data
          </h2>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* RLHF Card */}
          <Card className="bg-white/5 border-white/10 rounded-2xl overflow-hidden">
            <CardContent className="p-10">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-6">
                Data Engine
              </p>
              <h3 className="text-2xl font-light text-white mb-4">
                RLHF & Human Feedback
              </h3>
              <p className="text-white/50 mb-8 leading-relaxed">
                Our experts provide the high-quality preference data, evaluations, and red-teaming that frontier AI models require to improve.
              </p>
              <Link href="/data-engine">
                <Button variant="ghost" className="p-0 h-auto text-white hover:text-white/70 hover:bg-transparent">
                  Learn more <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Expert Network Card */}
          <Card className="bg-white/5 border-white/10 rounded-2xl overflow-hidden">
            <CardContent className="p-10">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-6">
                Expert Network
              </p>
              <h3 className="text-2xl font-light text-white mb-4">
                Top 1% of global talent
              </h3>
              <p className="text-white/50 mb-8 leading-relaxed">
                Pre-vetted PhDs, engineers, doctors, lawyers, and domain specialists — deployed to your projects within 24-48 hours.
              </p>
              <Link href="/experts">
                <Button variant="ghost" className="p-0 h-auto text-white hover:text-white/70 hover:bg-transparent">
                  Browse experts <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Features */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="py-8 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
              Aria
            </p>
            <h3 className="text-lg font-light text-white mb-3">
              AI Interviewer
            </h3>
            <p className="text-sm text-white/50 mb-4">
              1,000+ technical interviews daily. Only the top 1% make it through.
            </p>
            <Link href="/aria" className="text-sm text-white hover:text-white/70 inline-flex items-center">
              Try Aria <ArrowRight className="ml-1 w-3 h-3" />
            </Link>
          </div>

          <div className="py-8 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
              Security
            </p>
            <h3 className="text-lg font-light text-white mb-3">
              Defense Ready
            </h3>
            <p className="text-sm text-white/50 mb-4">
              SOC 2 certified. ITAR compliant. US-based expert tier available.
            </p>
            <Link href="/security" className="text-sm text-white hover:text-white/70 inline-flex items-center">
              Learn more <ArrowRight className="ml-1 w-3 h-3" />
            </Link>
          </div>

          <div className="py-8 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-4">
              API
            </p>
            <h3 className="text-lg font-light text-white mb-3">
              Developer Tools
            </h3>
            <p className="text-sm text-white/50 mb-4">
              Integrate expert feedback directly into your training pipeline.
            </p>
            <Link href="/developers" className="text-sm text-white hover:text-white/70 inline-flex items-center">
              View docs <ArrowRight className="ml-1 w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;

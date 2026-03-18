"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FileText,
  MessageSquare,
  BarChart3,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface ToolCard {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string | null;
  comingSoon: boolean;
  color: string;
  bgColor: string;
  borderColor: string;
}

const tools: ToolCard[] = [
  {
    title: "Resume Builder",
    description: "Create and optimize your resume with professional templates and AI-powered suggestions.",
    icon: FileText,
    href: "/candidate/documents",
    comingSoon: false,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    title: "Interview Prep",
    description: "Practice common interview questions with AI-powered feedback and coaching.",
    icon: MessageSquare,
    href: null,
    comingSoon: true,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  {
    title: "Skill Gap Analysis",
    description: "Compare your skills with job requirements to identify areas for improvement.",
    icon: BarChart3,
    href: null,
    comingSoon: true,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  {
    title: "Career Resources",
    description: "Guides, tips, and industry insights to help you advance your career.",
    icon: BookOpen,
    href: null,
    comingSoon: true,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
];

export default function CareerToolsPage() {
  return (
    <div>
      <div className="container mx-auto px-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">Career Tools</h1>
            <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/20">
              <Sparkles className="w-3 h-3 mr-1" />
              New
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Resources to advance your career and land your next role.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Card
                key={tool.title}
                className={cn(
                  "border-border bg-card shadow-none transition-all duration-200",
                  tool.href && "hover:bg-accent hover:border-border"
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center border",
                        tool.bgColor,
                        tool.borderColor
                      )}
                    >
                      <Icon className={cn("w-6 h-6", tool.color)} />
                    </div>
                    {tool.comingSoon && (
                      <Badge
                        variant="outline"
                        className="border-border text-muted-foreground text-xs"
                      >
                        Coming Soon
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-foreground text-lg mt-4">
                    {tool.title}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {tool.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tool.href ? (
                    <Link href={tool.href}>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg w-full"
                      >
                        Get Started
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      disabled
                      className="w-full rounded-lg bg-card text-muted-foreground border border-border cursor-not-allowed"
                    >
                      Coming Soon
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 rounded-2xl border border-border bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-8 text-center">
          <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            More tools are on the way
          </h3>
          <p className="text-muted-foreground max-w-lg mx-auto">
            We are building more career development tools to help you succeed.
            Stay tuned for interview prep, skill analysis, and more.
          </p>
        </div>
      </div>
    </div>
  );
}

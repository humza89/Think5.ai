"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, TrendingUp, AlertCircle, PlayCircle, Loader2 } from "lucide-react";
import { RadialBarChart, RadialBar, Legend, Tooltip, ResponsiveContainer, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, RadarChart } from "recharts";

// Shared color constants for consistent enterprise styling
const COLORS = {
  excellent: "#10b981", // Emerald 500
  good: "#3b82f6",      // Blue 500
  fair: "#f59e0b",      // Amber 500
  poor: "#ef4444"       // Red 500
};

export default function CandidateResultsDashboard({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // In production, fetch from /api/v1/interviews/:id/results
  useEffect(() => {
    // Simulating API load
    setTimeout(() => {
      setData({
        jobTitle: "Senior Project Manager",
        company: "BuildIt Corp",
        score: 85,
        percentile: 92,
        recommendation: "STRONG_YES",
        strengths: [
          "Demonstrated exceptional understanding of Agile methodologies.",
          "Clear, concise communication under pressure.",
          "Strong conflict resolution framework."
        ],
        improvements: [
          "Provide more metric-driven answers for your past results.",
          "Ensure consistent eye contact with the camera."
        ],
        radarData: [
          { subject: 'Technical', A: 90, fullMark: 100 },
          { subject: 'Communication', A: 85, fullMark: 100 },
          { subject: 'Problem Solving', A: 88, fullMark: 100 },
          { subject: 'Culture Fit', A: 95, fullMark: 100 },
          { subject: 'Domain Expert', A: 80, fullMark: 100 },
        ],
        technicalBreakdown: [
          { skill: "Agile Workflow", score: 9 },
          { skill: "Stakeholder Alignment", score: 8 },
          { skill: "Risk Management", score: 9 }
        ]
      });
      setLoading(false);
    }, 1500);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Analyzing Interview Telemetry...</p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return COLORS.excellent;
    if (score >= 70) return COLORS.good;
    if (score >= 50) return COLORS.fair;
    return COLORS.poor;
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Results</h1>
          <p className="text-muted-foreground mt-1">
            {data.jobTitle} at {data.company}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="px-3 py-1 text-sm bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
            Top {100 - data.percentile}% Performer
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-sm">
            AI Scored
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Overall Score & Radar */}
        <div className="space-y-8 lg:col-span-1">
          {/* Overall Score Card */}
          <Card className="shadow-md border-border">
            <CardHeader className="text-center pb-2">
              <CardTitle>Overall Match Score</CardTitle>
              <CardDescription>Composite AI Grading</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="relative w-48 h-48 flex items-center justify-center">
                {/* Simulated Circular Progress */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted" />
                  <circle 
                    cx="96" cy="96" r="80" stroke={getScoreColor(data.score)} strokeWidth="12" fill="transparent" 
                    strokeDasharray={80 * 2 * Math.PI} 
                    strokeDashoffset={80 * 2 * Math.PI - ((80 * 2 * Math.PI) * data.score) / 100} 
                    className="transition-all duration-1000 ease-in-out" strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-bold tracking-tighter" style={{ color: getScoreColor(data.score) }}>
                    {data.score}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">OUT OF 100</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Radar Chart Card */}
          <Card className="shadow-md border-border">
            <CardHeader>
              <CardTitle className="text-lg">Competency Profile</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data.radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#888888', fontSize: 12 }} />
                  <Radar name="Score" dataKey="A" stroke={COLORS.good} fill={COLORS.good} fillOpacity={0.4} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'black', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: 'white' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Detailed Feedback */}
        <div className="space-y-8 lg:col-span-2">
          
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Strengths */}
            <Card className="bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-lg">
                  <CheckCircle2 className="h-5 w-5" /> Key Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.strengths.map((str: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      {str}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Improvements */}
            <Card className="bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-lg">
                  <TrendingUp className="h-5 w-5" /> Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.improvements.map((str: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      {str}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Technical Breakdown */}
          <Card className="shadow-md border-border">
            <CardHeader>
              <CardTitle>Technical Evaluation</CardTitle>
              <CardDescription>Specific skill breakdown based on the interview rubric.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {data.technicalBreakdown.map((item: any, i: number) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">{item.skill}</span>
                      <span className="text-muted-foreground font-mono">{item.score}/10</span>
                    </div>
                    {/* Visual Bar */}
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${(item.score / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

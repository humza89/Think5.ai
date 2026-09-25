/**
 * Deterministic mock interviewer + scorer for the golden path (Phase 0 T14).
 *
 * Selected through the existing per-stage provider switch
 * (`AI_PROVIDER_INTERVIEWING=mock`, `AI_PROVIDER_SCORING=mock`, or
 * `AI_PROVIDER=mock`). Used by CI and local runs of
 * e2e/golden/writes-invite-to-report.spec.ts so the invite → interview →
 * report path is exercised end to end without any AI provider key. Never
 * selected in production unless an operator sets the variable.
 */
import { createHash } from "crypto";
import { getProviderForStage } from "./interface";
import type { InterviewReportData } from "@/lib/gemini";

export interface TranscriptEntry {
  role: string;
  content: string;
  timestamp?: string;
}

export function isMockInterviewing(): boolean {
  return getProviderForStage("interviewing") === "mock";
}

export function isMockScoring(): boolean {
  return getProviderForStage("scoring") === "mock";
}

const QUESTIONS = [
  "Thanks for joining. To start, walk me through a project you led end to end and what your specific contribution was.",
  "What was the hardest technical trade-off in that work, and how did you decide?",
  "Tell me about a time a system you owned failed in production. What did you change afterwards?",
  "How do you decide what to measure when you ship something new?",
  "Last one: what would you do differently if you started that project again today?",
];

/** The next interviewer turn given the transcript so far; deterministic. */
export function mockInterviewerReply(history: Array<{ role: string; content: string }>, userMessage: string): string {
  const asked = history.filter((h) => h.role === "interviewer" || h.role === "model").length;
  if (asked === 0) return `Hi, I'm Aria. ${QUESTIONS[0]}`;
  const ack = userMessage.trim().length > 120 ? "That is a thorough answer, thank you." : "Understood, thank you.";
  const next = QUESTIONS[asked] ?? "Thank you, that covers everything I wanted to ask. We can wrap up here.";
  return `${ack} ${next}`;
}

function seededScore(seed: string, min: number, max: number): number {
  const n = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return min + (n % (max - min + 1));
}

/** A complete, evidence-linked report shaped like the scorer's output. */
export function buildMockInterviewReport(transcript: TranscriptEntry[], candidate: { fullName: string; currentTitle?: string | null; skills?: unknown }): InterviewReportData {
  const candidateTurns = transcript.map((t, i) => ({ t, i })).filter(({ t }) => t.role === "candidate" || t.role === "user");
  const seed = transcript.map((t) => t.content).join("|");
  const base = seededScore(seed, 6, 8);
  const quote = (k: number) => (candidateTurns[k] ? `[#${candidateTurns[k].i}] ${candidateTurns[k].t.content.slice(0, 120)}` : "No candidate answer recorded.");
  const skills = Array.isArray(candidate.skills) ? (candidate.skills as string[]).slice(0, 3) : ["Problem solving"];
  const words = candidateTurns.reduce((n, { t }) => n + t.content.split(/\s+/).length, 0);
  const overall = Math.min(100, Math.max(40, base * 10 + Math.min(10, Math.floor(words / 40))));
  return {
    technicalSkills: skills.map((skill, i) => ({ skill, rating: Math.min(10, base + (i % 2)), description: `Assessed through the project and trade-off questions.`, evidence: quote(i) })),
    softSkills: [
      { skill: "Communication", rating: base, description: `Clear, structured answers. Evidence: ${quote(0)}` },
      { skill: "Problem Solving Approach", rating: Math.max(0, base - 1), description: `Named trade-offs and reasoning. Evidence: ${quote(1)}` },
    ],
    domainExpertise: base,
    clarityStructure: base,
    problemSolving: Math.max(0, base - 1),
    communicationScore: base,
    measurableImpact: Math.max(0, base - 2),
    summary: `${candidate.fullName}${candidate.currentTitle ? ` (${candidate.currentTitle})` : ""} answered ${candidateTurns.length} question(s) in a mocked interview. Responses were ${words > 150 ? "detailed" : "brief"} and consistently on topic.`,
    strengths: ["Structured answers with concrete examples", "Comfortable discussing trade-offs"],
    areasToImprove: ["Quantify impact more often", "Discuss monitoring and failure modes proactively"],
    recommendation: overall >= 75 ? "YES" : overall >= 60 ? "MAYBE" : "NO",
    hiringAdvice: "Mocked assessment for the golden path; verify with a live interview before making a decision.",
    overallScore: overall,
    integrityScore: 95,
    integrityFlags: [],
    professionalExperience: base,
    roleFit: base,
    culturalFit: base,
    thinkingJudgment: base,
    confidenceLevel: candidateTurns.length >= 3 ? "MEDIUM" : "LOW",
    headline: `${candidate.fullName}: ${overall >= 75 ? "solid" : "mixed"} mocked interview, ${candidateTurns.length} answers`,
    riskSignals: [],
    hypothesisOutcomes: [],
    evidenceHighlights: candidateTurns.slice(0, 2).map(({ t, i }) => ({ type: "strength" as const, summary: t.content.slice(0, 160), transcriptRange: { startIdx: i, endIdx: i } })),
    jobMatchScore: null,
    requirementMatches: null,
    environmentFitNotes: null,
  };
}

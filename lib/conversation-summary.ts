/**
 * Conversation Summary Generator
 *
 * @deprecated This module uses heuristic regex extraction which is being replaced
 * by the LLM-powered knowledge graph pipeline (inngest/functions/update-aria-memory.ts).
 * The knowledge graph extracts verified claims, behavioral signals, technical stack,
 * timeline, and notable quotes via Gemini — far richer than regex pattern matching.
 *
 * This module is kept as a zero-latency fallback for reconnect context until
 * the knowledge graph is fully integrated into the rehydration flow.
 * New code should read from Interview.knowledgeGraph instead.
 *
 * Heuristic extraction (no LLM call — zero latency):
 * 1. Interviewer turns: extract first sentence (the question)
 * 2. Candidate turns: extract sentences with numbers, company names, tech terms
 * 3. Group by module scores
 * 4. Cap at ~500 words
 */

interface TranscriptEntry {
  role: string;
  content: string;
  timestamp?: string;
}

interface ModuleScore {
  module: string;
  score: number;
  reason: string;
  sectionNotes?: string;
}

interface CandidateProfile {
  strengths: string[];
  weaknesses: string[];
  communicationStyle?: string;
  confidenceLevel?: "low" | "moderate" | "high";
}

const MAX_SUMMARY_WORDS = 500;

/**
 * Extract the first sentence from text (used for interviewer questions).
 */
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : text.slice(0, 150).trim();
}

/**
 * Extract key claims from candidate responses — sentences containing
 * numbers, percentages, company/tech terms, or action verbs.
 *
 * @deprecated Use Interview.knowledgeGraph.verified_claims instead.
 * The LLM knowledge graph (update-aria-memory.ts) extracts richer,
 * semantically verified claims via Gemini rather than regex heuristics.
 */
function extractKeyClaims(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
  const claims: string[] = [];

  for (const sentence of sentences) {
    const hasNumbers = /\d+/.test(sentence);
    const hasPercentage = /%|percent/i.test(sentence);
    const hasMetrics = /latency|throughput|uptime|SLA|p\d{2}|QPS|TPS|requests/i.test(sentence);
    const hasScale = /million|billion|thousand|100\+|200\+|\d+k|\d+M/i.test(sentence);
    const hasAction = /led|built|designed|migrated|reduced|increased|implemented|architected|managed|launched|scaled/i.test(sentence);

    if (hasNumbers || hasPercentage || hasMetrics || hasScale || hasAction) {
      claims.push(sentence.trim().slice(0, 200));
    }
  }

  return claims.slice(0, 5); // Cap at 5 key claims
}

/**
 * Generate a structured conversation summary from transcript data.
 *
 * @deprecated Kept as a zero-latency fallback for reconnect context compression.
 * Prefer Interview.knowledgeGraph for semantic interview memory.
 * See inngest/functions/update-aria-memory.ts for the LLM-powered replacement.
 *
 * @param transcript Full interview transcript
 * @param moduleScores Completed module scores
 * @param candidateProfile Optional candidate profile from updateCandidateProfile tool
 * @param summarizeUpTo Only summarize entries up to this index (entries after are in context)
 * @returns Structured summary string (~500 words max)
 */
export function generateConversationSummary(
  transcript: TranscriptEntry[],
  moduleScores: ModuleScore[],
  candidateProfile: CandidateProfile | null,
  summarizeUpTo: number
): string {
  if (summarizeUpTo <= 0) return "";

  const entriesToSummarize = transcript.slice(0, summarizeUpTo);
  const sections: string[] = [];

  // 1. Opening context — first 4 entries
  const opening = entriesToSummarize.slice(0, 4);
  if (opening.length > 0) {
    const candidateOpening = opening
      .filter((e) => e.role === "candidate")
      .map((e) => firstSentence(e.content))
      .join(" ");
    if (candidateOpening) {
      sections.push(`Opening: ${candidateOpening}`);
    }
  }

  // 2. Questions asked by interviewer (extract first sentence of each)
  const questions = entriesToSummarize
    .filter((e) => e.role === "interviewer" && e.content.includes("?"))
    .map((e) => firstSentence(e.content))
    .slice(0, 15); // Cap at 15 questions

  if (questions.length > 0) {
    sections.push(`Questions covered (${questions.length}): ${questions.map((q, i) => `${i + 1}. ${q}`).join(" ")}`);
  }

  // 3. Key claims from candidate
  const allClaims: string[] = [];
  for (const entry of entriesToSummarize) {
    if (entry.role === "candidate") {
      allClaims.push(...extractKeyClaims(entry.content));
    }
  }
  const uniqueClaims = [...new Set(allClaims)].slice(0, 8);
  if (uniqueClaims.length > 0) {
    sections.push(`Key candidate claims: ${uniqueClaims.map((c) => `"${c.slice(0, 120)}"`).join("; ")}`);
  }

  // 4. Module scores summary
  if (moduleScores.length > 0) {
    const scoresText = moduleScores
      .map((s) => {
        const notes = s.sectionNotes ? ` — ${s.sectionNotes}` : "";
        return `${s.module}: ${s.score}/10${notes}`;
      })
      .join("; ");
    sections.push(`Sections completed: ${scoresText}`);
  }

  // 5. Candidate profile if available
  if (candidateProfile) {
    const parts: string[] = [];
    if (candidateProfile.strengths.length > 0) {
      parts.push(`Strengths: ${candidateProfile.strengths.join(", ")}`);
    }
    if (candidateProfile.weaknesses.length > 0) {
      parts.push(`Weaknesses: ${candidateProfile.weaknesses.join(", ")}`);
    }
    if (parts.length > 0) {
      sections.push(`Candidate profile: ${parts.join(". ")}`);
    }
  }

  // 6. Assemble and cap at word limit
  let summary = sections.map((s) => `- ${s}`).join("\n");
  const words = summary.split(/\s+/);
  if (words.length > MAX_SUMMARY_WORDS) {
    summary = words.slice(0, MAX_SUMMARY_WORDS).join(" ") + "...";
  }

  return summary;
}

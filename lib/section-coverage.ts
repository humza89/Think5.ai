/**
 * Section Coverage Validation
 *
 * Evaluates each interview section against its planned objectives
 * using AI analysis. Computes evidence sufficiency and objective coverage.
 */

import { prisma } from "@/lib/prisma";

interface ObjectiveCoverage {
  objective: string;
  covered: boolean;
  evidenceSnippet: string | null;
}

type SufficiencyLevel = "SUFFICIENT" | "INSUFFICIENT" | "PARTIAL";

/**
 * Validate section coverage for a completed interview.
 * Analyzes transcript against planned sections to compute
 * evidence sufficiency and per-objective coverage.
 */
export async function validateSectionCoverage(
  interviewId: string
): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      transcript: true,
      interviewPlan: true,
      sections: true,
    },
  });

  if (!interview || !interview.transcript || !interview.interviewPlan) return;

  const transcript = interview.transcript as Array<{
    role: string;
    content: string;
  }>;
  const plan = interview.interviewPlan as Record<string, unknown>;
  const sections = interview.sections;

  if (sections.length === 0) return;

  // Extract planned objectives from the interview plan
  const plannedSections = (plan.sections ||
    plan.interviewSections ||
    []) as Array<{
    name?: string;
    sectionName?: string;
    objectives?: string[];
    topics?: string[];
    questions?: Array<string | { text: string }>;
  }>;

  for (const section of sections) {
    // Find the matching planned section
    const planned = plannedSections.find(
      (ps) =>
        (ps.name || ps.sectionName || "").toLowerCase() ===
        section.sectionName.toLowerCase()
    );

    if (!planned) continue;

    // Extract objectives from plan
    const objectives: string[] = planned.objectives ||
      planned.topics ||
      (planned.questions || []).map((q) =>
        typeof q === "string" ? q : q.text
      );

    if (objectives.length === 0) continue;

    // Simple keyword-based coverage check against transcript
    const sectionTranscript = extractSectionTranscript(
      transcript,
      section.sectionOrder,
      sections.length
    );
    const transcriptText = sectionTranscript
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();

    const objectivesCovered: ObjectiveCoverage[] = objectives.map(
      (objective) => {
        const keywords = extractKeywords(objective);
        const matched = keywords.some((kw) => transcriptText.includes(kw));

        // Find evidence snippet
        let evidenceSnippet: string | null = null;
        if (matched) {
          for (const msg of sectionTranscript) {
            const lowerContent = msg.content.toLowerCase();
            if (keywords.some((kw) => lowerContent.includes(kw))) {
              evidenceSnippet = msg.content.slice(0, 200);
              break;
            }
          }
        }

        return {
          objective,
          covered: matched,
          evidenceSnippet,
        };
      }
    );

    const coveredCount = objectivesCovered.filter((o) => o.covered).length;
    const coverageRatio = coveredCount / objectives.length;

    let evidenceSufficiency: SufficiencyLevel;
    if (coverageRatio >= 0.8) {
      evidenceSufficiency = "SUFFICIENT";
    } else if (coverageRatio >= 0.4) {
      evidenceSufficiency = "PARTIAL";
    } else {
      evidenceSufficiency = "INSUFFICIENT";
    }

    // Update the section record
    await prisma.interviewSection.update({
      where: { id: section.id },
      data: {
        evidenceSufficiency,
        objectivesCovered: objectivesCovered as unknown as object[],
        coverageScore: Math.round(coverageRatio * 100),
      },
    });
  }
}

/**
 * Extract the portion of transcript that roughly corresponds to a section.
 * Uses simple proportional splitting based on section order.
 */
function extractSectionTranscript(
  transcript: Array<{ role: string; content: string }>,
  sectionOrder: number,
  totalSections: number
): Array<{ role: string; content: string }> {
  if (transcript.length === 0 || totalSections === 0) return transcript;

  const messagesPerSection = Math.ceil(transcript.length / totalSections);
  const start = sectionOrder * messagesPerSection;
  const end = Math.min(start + messagesPerSection, transcript.length);

  return transcript.slice(start, end);
}

/**
 * Extract searchable keywords from an objective string.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "shall",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "and", "or", "but", "not", "this", "that", "these", "those",
    "how", "what", "which", "who", "when", "where", "why",
    "about", "their", "they", "them", "your", "you",
  ]);

  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Interview Planner — Resume-aware adaptive question plan generator
 *
 * Analyzes candidate profile + job requirements + template config to create
 * a personalized interview plan. The plan is injected into the Gemini Live
 * session as system context, enabling adaptive questioning.
 */

import { generateWithGemini } from "./gemini-live";
import {
  type SkillModuleDefinition,
  DEFAULT_SKILL_MODULES,
  getModuleByName,
} from "./skill-modules";

// ── Types ──────────────────────────────────────────────────────────────

export interface CandidateProfile {
  fullName: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: string[];
  experienceYears?: number | null;
  resumeText?: string | null;
  industries?: string[];
}

export interface JobRequirements {
  title: string;
  description?: string;
  skillsRequired?: string[];
  seniorityLevel?: string;
  industry?: string;
}

export interface InterviewPlanSection {
  skillModule: string;
  category: string;
  targetQuestions: number;
  difficultyStart: "junior" | "mid" | "senior" | "staff";
  keyTopicsFromResume: string[];
  scoringRubric: string;
  estimatedDuration: number; // minutes
}

export interface InterviewPlan {
  sections: InterviewPlanSection[];
  totalDuration: number;
  totalQuestions: number;
  personalizedContext: string;
  difficultyStrategy: string;
  openingInstruction: string;
  closingInstruction: string;
  generatedAt: string;
}

// ── Plan Generator ─────────────────────────────────────────────────────

/**
 * Generate a personalized interview plan based on candidate + job + modules.
 * Uses Gemini to analyze the resume and create adaptive questioning strategy.
 */
export async function generateInterviewPlan(
  candidate: CandidateProfile,
  job: JobRequirements,
  moduleNames: string[]
): Promise<InterviewPlan> {
  // Resolve modules (fall back to defaults if custom not found)
  const modules = moduleNames
    .map((name) => getModuleByName(name))
    .filter((m): m is SkillModuleDefinition => m !== undefined);

  if (modules.length === 0) {
    // Default to a balanced interview
    return generateDefaultPlan(candidate, job);
  }

  const systemPrompt = `You are an expert technical interview planner. Your job is to create a personalized interview plan that adapts to the candidate's background.

You will analyze the candidate's resume and the job requirements to create targeted questions for each skill module.

Return ONLY valid JSON matching the InterviewPlan structure.`;

  const userPrompt = `Create a personalized interview plan for this candidate and role.

CANDIDATE:
- Name: ${candidate.fullName}
- Current Role: ${candidate.currentTitle || "N/A"} at ${candidate.currentCompany || "N/A"}
- Experience: ${candidate.experienceYears || "Unknown"} years
- Skills: ${candidate.skills?.join(", ") || "Not specified"}
- Industries: ${(candidate.industries || []).join(", ") || "Not specified"}
${candidate.resumeText ? `\nRESUME TEXT (first 3000 chars):\n${candidate.resumeText.slice(0, 3000)}` : ""}

JOB:
- Title: ${job.title}
- Required Skills: ${job.skillsRequired?.join(", ") || "Not specified"}
- Seniority: ${job.seniorityLevel || "Not specified"}
${job.description ? `- Description: ${job.description.slice(0, 1000)}` : ""}

SKILL MODULES TO ASSESS (in order):
${modules.map((m, i) => `${i + 1}. ${m.name} (${m.category}, ${m.duration} min)`).join("\n")}

For each module, provide:
- targetQuestions: 2-3 questions per module
- difficultyStart: based on candidate experience (junior/mid/senior/staff)
- keyTopicsFromResume: specific topics from their resume to probe
- scoringRubric: brief description of what good answers look like

Also provide:
- personalizedContext: 2-3 sentences about what to focus on based on the resume
- difficultyStrategy: how to adjust difficulty during the interview
- openingInstruction: how Aria should greet and introduce the interview
- closingInstruction: how Aria should wrap up

Return valid JSON with this structure:
{
  "sections": [{ "skillModule", "category", "targetQuestions", "difficultyStart", "keyTopicsFromResume", "scoringRubric", "estimatedDuration" }],
  "totalDuration": number,
  "totalQuestions": number,
  "personalizedContext": string,
  "difficultyStrategy": string,
  "openingInstruction": string,
  "closingInstruction": string
}`;

  try {
    const response = await generateWithGemini(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 2048,
    });

    // Extract JSON from response (handle markdown code blocks)
    const jsonStr = response.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const plan = JSON.parse(jsonStr) as Omit<InterviewPlan, "generatedAt">;

    return {
      ...plan,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to generate interview plan with AI, using default:", error);
    return generateDefaultPlan(candidate, job);
  }
}

/**
 * Generate a default plan when AI generation fails or no modules specified.
 */
function generateDefaultPlan(
  candidate: CandidateProfile,
  job: JobRequirements
): InterviewPlan {
  const experienceYears = candidate.experienceYears || 3;
  const difficultyStart = experienceYears >= 8 ? "senior" : experienceYears >= 4 ? "mid" : "junior";

  // Pick default modules based on job title
  const isTechnical = /engineer|developer|architect|sre|devops/i.test(job.title);
  const defaultModules = isTechnical
    ? ["System Design", "Backend Engineering", "Problem Solving & Decision Making"]
    : ["Communication", "Leadership & Influence", "Problem Solving & Decision Making"];

  const sections: InterviewPlanSection[] = defaultModules.map((name) => {
    const mod = getModuleByName(name);
    return {
      skillModule: name,
      category: mod?.category || "behavioral",
      targetQuestions: 2,
      difficultyStart: difficultyStart as "junior" | "mid" | "senior",
      keyTopicsFromResume: candidate.skills?.slice(0, 3) || [],
      scoringRubric: mod?.rubric.levels.mid || "Demonstrates solid understanding with specific examples",
      estimatedDuration: mod?.duration || 5,
    };
  });

  return {
    sections,
    totalDuration: sections.reduce((sum, s) => sum + s.estimatedDuration, 0),
    totalQuestions: sections.reduce((sum, s) => sum + s.targetQuestions, 0),
    personalizedContext: `${candidate.fullName} has ${experienceYears} years of experience${candidate.currentTitle ? ` as ${candidate.currentTitle}` : ""}. Focus on ${candidate.skills?.slice(0, 3).join(", ") || "general competency"}.`,
    difficultyStrategy: `Start at ${difficultyStart} level. Increase difficulty when candidate gives strong, detailed answers with specific examples. Decrease when candidate struggles or gives vague responses.`,
    openingInstruction: `Greet ${candidate.fullName} warmly. Introduce yourself as Aria, the AI interviewer. Briefly explain the interview format: ${sections.length} sections covering ${sections.map((s) => s.skillModule).join(", ")}. Ask if they have any questions before starting.`,
    closingInstruction: `Thank ${candidate.fullName} for their time. Mention that a detailed report will be generated and shared with the recruiter. Ask if they have any final questions or anything they'd like to add.`,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Convert an interview plan to system prompt context for Gemini Live.
 */
export function planToSystemContext(plan: InterviewPlan): string {
  const sections = plan.sections
    .map(
      (s, i) =>
        `Section ${i + 1}: ${s.skillModule} (${s.category})
  - Ask ${s.targetQuestions} questions, starting at ${s.difficultyStart} difficulty
  - Key topics to probe: ${s.keyTopicsFromResume.join(", ") || "general"}
  - Scoring: ${s.scoringRubric}
  - Duration target: ~${s.estimatedDuration} minutes`
    )
    .join("\n\n");

  return `
INTERVIEW PLAN (follow this structure):

${plan.personalizedContext}

DIFFICULTY STRATEGY: ${plan.difficultyStrategy}

OPENING: ${plan.openingInstruction}

SECTIONS:
${sections}

CLOSING: ${plan.closingInstruction}

IMPORTANT RULES:
- Ask ONE question at a time. Wait for the candidate's full response before continuing.
- Use follow-up questions to probe deeper when answers are strong or vague.
- Use the adaptive difficulty tools (adjustDifficulty, moveToNextSection) as appropriate.
- Call endInterview when all sections are covered or time is running low.
- Be conversational and encouraging — this should feel like a natural dialogue, not an interrogation.
- Total target: ${plan.totalQuestions} questions across ${plan.sections.length} sections in ~${plan.totalDuration} minutes.
`;
}

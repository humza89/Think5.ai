/**
 * Interview Planner — Resume-aware adaptive question plan generator
 *
 * Analyzes candidate profile + job requirements + template config to create
 * a personalized interview plan with hypothesis-driven questioning.
 *
 * The plan is injected into the Gemini Live session as system context,
 * enabling adaptive, hypothesis-testing conversation.
 */

import { generateWithGemini } from "./gemini-live";
import {
  type SkillModuleDefinition,
  DEFAULT_SKILL_MODULES,
  getModuleByName,
} from "./skill-modules";

// ── Types ──────────────────────────────────────────────────────────────

export type InterviewMode =
  | "GENERAL_PROFILE"
  | "JOB_FIT"
  | "HYBRID"
  | "CULTURAL_FIT"
  | "TECHNICAL_DEEP_DIVE"
  | "SCREENING"
  | "CUSTOM";

export interface CandidateProfile {
  fullName: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: string[];
  experienceYears?: number | null;
  resumeText?: string | null;
  industries?: string[];
  experiences?: Array<{
    company?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    isCurrent?: boolean;
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    field?: string;
  }>;
}

export interface JobRequirements {
  title: string;
  description?: string;
  skillsRequired?: string[];
  skillsPreferred?: string[];
  seniorityLevel?: string;
  industry?: string;
  teamContext?: string;
  companyContext?: string;
}

export interface InterviewHypothesisInput {
  hypothesis: string;
  source: "resume_analysis" | "skill_gap" | "career_pattern" | "recruiter_objective";
}

export interface InterviewPlanSection {
  skillModule: string;
  category: string;
  objective: string;
  targetQuestions: number;
  difficultyStart: "junior" | "mid" | "senior" | "staff";
  keyTopicsFromResume: string[];
  scoringRubric: string;
  estimatedDuration: number; // minutes
  entryCondition?: string;
}

export interface InterviewPlan {
  mode: InterviewMode;
  sections: InterviewPlanSection[];
  hypotheses: InterviewHypothesisInput[];
  totalDuration: number;
  totalQuestions: number;
  personalizedContext: string;
  difficultyStrategy: string;
  openingInstruction: string;
  closingInstruction: string;
  recruiterObjectives?: string[];
  customScreeningQuestions?: string[];
  generatedAt: string;
}

// ── Plan Generator ─────────────────────────────────────────────────────

export interface PlanGenerationOptions {
  mode?: InterviewMode;
  recruiterObjectives?: string[];
  hmNotes?: string;
  customScreeningQuestions?: string[];
}

/**
 * Generate a personalized interview plan based on candidate + job + modules.
 * Uses Gemini to analyze the resume, form testable hypotheses, and create
 * an adaptive questioning strategy.
 */
export async function generateInterviewPlan(
  candidate: CandidateProfile,
  job: JobRequirements,
  moduleNames: string[],
  options: PlanGenerationOptions = {}
): Promise<InterviewPlan> {
  const mode = options.mode || "GENERAL_PROFILE";

  // Resolve modules (fall back to defaults if custom not found)
  const modules = moduleNames
    .map((name) => getModuleByName(name))
    .filter((m): m is SkillModuleDefinition => m !== undefined);

  if (modules.length === 0) {
    return generateDefaultPlan(candidate, job, mode, options);
  }

  const systemPrompt = `You are an expert interview planner building a hypothesis-driven interview.

Your job is to:
1. Analyze the candidate's resume and background
2. Form 5-8 testable hypotheses about their true capabilities, depth, and potential gaps
3. Design interview sections that test those hypotheses through conversation
4. Create a personalized, adaptive plan

HYPOTHESIS EXAMPLES:
- "Candidate claims 5 years React but resume shows mostly jQuery-era stack. React experience may be limited to recent roles."
- "Resume mentions 'led migration to microservices' but no architectural details. May have been a participant, not the architect."
- "7 years at same company with title progression. Strong internal mobility but may lack breadth."

Each hypothesis must be testable through interview questions. The interview should confirm, refute, or leave inconclusive each hypothesis.

Return ONLY valid JSON.`;

  const modeInstruction = getModeInstruction(mode);
  const experienceContext = formatExperienceContext(candidate);

  const userPrompt = `Create a hypothesis-driven interview plan.

INTERVIEW MODE: ${mode}
${modeInstruction}

CANDIDATE:
- Name: ${candidate.fullName}
- Current Role: ${candidate.currentTitle || "N/A"} at ${candidate.currentCompany || "N/A"}
- Experience: ${candidate.experienceYears || "Unknown"} years
- Skills: ${candidate.skills?.join(", ") || "Not specified"}
- Industries: ${(candidate.industries || []).join(", ") || "Not specified"}
${experienceContext}
${candidate.resumeText ? `\nRESUME TEXT (first 4000 chars):\n${candidate.resumeText.slice(0, 4000)}` : ""}

JOB:
- Title: ${job.title}
- Required Skills: ${job.skillsRequired?.join(", ") || "Not specified"}
- Preferred Skills: ${job.skillsPreferred?.join(", ") || "Not specified"}
- Seniority: ${job.seniorityLevel || "Not specified"}
${job.description ? `- Description: ${job.description.slice(0, 1500)}` : ""}
${job.teamContext ? `- Team Context: ${job.teamContext}` : ""}
${job.companyContext ? `- Company Context: ${job.companyContext}` : ""}

${options.recruiterObjectives?.length ? `RECRUITER OBJECTIVES (the AI MUST investigate these):\n${options.recruiterObjectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : ""}

${options.hmNotes ? `HIRING MANAGER NOTES (visible only to AI, use to shape questions):\n${options.hmNotes}` : ""}

${options.customScreeningQuestions?.length ? `MANDATORY SCREENING QUESTIONS (must be asked verbatim):\n${options.customScreeningQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}

SKILL MODULES TO ASSESS (in order):
${modules.map((m, i) => `${i + 1}. ${m.name} (${m.category}, ${m.duration} min)`).join("\n")}

Return valid JSON:
{
  "sections": [{
    "skillModule": string,
    "category": string,
    "objective": string,
    "targetQuestions": number,
    "difficultyStart": "junior"|"mid"|"senior"|"staff",
    "keyTopicsFromResume": string[],
    "scoringRubric": string,
    "estimatedDuration": number,
    "entryCondition": string
  }],
  "hypotheses": [{
    "hypothesis": string,
    "source": "resume_analysis"|"skill_gap"|"career_pattern"|"recruiter_objective"
  }],
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
      maxTokens: 4096,
    });

    const jsonStr = response.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const plan = JSON.parse(jsonStr) as Omit<InterviewPlan, "generatedAt" | "mode" | "recruiterObjectives" | "customScreeningQuestions">;

    return {
      ...plan,
      mode,
      hypotheses: plan.hypotheses || [],
      recruiterObjectives: options.recruiterObjectives,
      customScreeningQuestions: options.customScreeningQuestions,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to generate interview plan with AI, using default:", error);
    return generateDefaultPlan(candidate, job, mode, options);
  }
}

/**
 * Get mode-specific instructions for the plan generator.
 */
function getModeInstruction(mode: InterviewMode): string {
  const instructions: Record<InterviewMode, string> = {
    GENERAL_PROFILE: `This is a GENERAL PROFILE interview. Focus on understanding the candidate holistically:
- Deep exploration of career arc (most recent 3 roles)
- Skills verification for top 3-4 claimed skills
- Thinking & judgment assessment
- Working style & cultural signals
- No job-specific evaluation needed`,

    JOB_FIT: `This is a JOB-FIT interview. Evaluate the candidate against the specific job:
- Career arc exploration focused on relevance to target role
- Skills verification driven by REQUIRED job skills
- Role-specific scenario question
- Team/environment fit assessment
- Produce both general assessment and job-specific fit score`,

    HYBRID: `This is a HYBRID interview. Start with general background, then evaluate job fit:
- Sections 1-3: General career arc and skills verification
- Sections 4-5: Role-specific scenario and cultural fit for the target team
- Produce both a reusable general profile AND job-specific assessment`,

    CULTURAL_FIT: `This is a CULTURAL FIT interview. Focus on working style and team dynamics:
- Communication and collaboration style
- Leadership and conflict handling
- Adaptability, ownership, and accountability
- Pace and environment preferences
- Remote work habits if relevant`,

    TECHNICAL_DEEP_DIVE: `This is a TECHNICAL DEEP DIVE interview for a specialist role:
- Go deep on 2-3 core technical areas
- Test implementation-level knowledge, not just conceptual
- Ask about tradeoffs, failure modes, debugging approaches
- Verify hands-on experience vs. theoretical knowledge
- Ramp difficulty aggressively for strong candidates`,

    SCREENING: `This is a SCREENING interview (15-20 min). Quick assessment:
- 2-3 high-signal questions per section
- Focus on deal-breakers and must-have qualifications
- Binary pass/fail mindset: can this person plausibly succeed?
- Skip deep probing; flag areas for follow-up interview`,

    CUSTOM: `This is a CUSTOM interview. Follow the template configuration exactly.`,
  };
  return instructions[mode];
}

/**
 * Format structured experience data for the planner prompt.
 */
function formatExperienceContext(candidate: CandidateProfile): string {
  if (!candidate.experiences?.length) return "";

  const lines = candidate.experiences.slice(0, 5).map((exp) => {
    const dates = [exp.startDate, exp.endDate || (exp.isCurrent ? "Present" : "")].filter(Boolean).join(" - ");
    return `  - ${exp.title || "Unknown"} at ${exp.company || "Unknown"} (${dates})${exp.description ? `: ${exp.description.slice(0, 200)}` : ""}`;
  });

  return `\nWORK HISTORY:\n${lines.join("\n")}`;
}

/**
 * Generate a default plan when AI generation fails or no modules specified.
 */
function generateDefaultPlan(
  candidate: CandidateProfile,
  job: JobRequirements,
  mode: InterviewMode = "GENERAL_PROFILE",
  options: PlanGenerationOptions = {}
): InterviewPlan {
  const experienceYears = candidate.experienceYears || 3;
  const difficultyStart = experienceYears >= 8 ? "senior" : experienceYears >= 4 ? "mid" : "junior";

  // Pick default modules based on mode and job title
  const isTechnical = /engineer|developer|architect|sre|devops/i.test(job.title);

  let defaultModules: string[];
  switch (mode) {
    case "CULTURAL_FIT":
      defaultModules = ["Communication", "Leadership & Influence", "Teamwork & Collaboration"];
      break;
    case "TECHNICAL_DEEP_DIVE":
      defaultModules = ["System Design", "Backend Engineering", "Data Structures & Algorithms"];
      break;
    case "SCREENING":
      defaultModules = isTechnical
        ? ["Problem Solving & Decision Making", "Communication"]
        : ["Communication", "Problem Solving & Decision Making"];
      break;
    default:
      defaultModules = isTechnical
        ? ["System Design", "Backend Engineering", "Problem Solving & Decision Making"]
        : ["Communication", "Leadership & Influence", "Problem Solving & Decision Making"];
  }

  const sections: InterviewPlanSection[] = defaultModules.map((name) => {
    const mod = getModuleByName(name);
    return {
      skillModule: name,
      category: mod?.category || "behavioral",
      objective: `Assess ${name.toLowerCase()} competency`,
      targetQuestions: mode === "SCREENING" ? 1 : 2,
      difficultyStart: difficultyStart as "junior" | "mid" | "senior",
      keyTopicsFromResume: candidate.skills?.slice(0, 3) || [],
      scoringRubric: mod?.rubric.levels.mid || "Demonstrates solid understanding with specific examples",
      estimatedDuration: mode === "SCREENING" ? 3 : (mod?.duration || 5),
    };
  });

  // Generate default hypotheses based on resume signals
  const hypotheses = generateDefaultHypotheses(candidate, job, mode);

  return {
    mode,
    sections,
    hypotheses,
    totalDuration: sections.reduce((sum, s) => sum + s.estimatedDuration, 0),
    totalQuestions: sections.reduce((sum, s) => sum + s.targetQuestions, 0),
    personalizedContext: `${candidate.fullName} has ${experienceYears} years of experience${candidate.currentTitle ? ` as ${candidate.currentTitle}` : ""}. Focus on ${candidate.skills?.slice(0, 3).join(", ") || "general competency"}.`,
    difficultyStrategy: `Start at ${difficultyStart} level. Increase difficulty when candidate gives strong, detailed answers with specific examples. Decrease when candidate struggles or gives vague responses.`,
    openingInstruction: `Greet ${candidate.fullName} warmly. Introduce yourself as Aria, the AI interviewer. Briefly explain the interview format: ${sections.length} sections covering ${sections.map((s) => s.skillModule).join(", ")}. Ask if they have any questions before starting.`,
    closingInstruction: `Thank ${candidate.fullName} for their time. Mention that a detailed report will be generated and shared with the recruiter. Ask if they have any final questions or anything they'd like to add.`,
    recruiterObjectives: options.recruiterObjectives,
    customScreeningQuestions: options.customScreeningQuestions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate default hypotheses from resume signals when AI generation is unavailable.
 */
function generateDefaultHypotheses(
  candidate: CandidateProfile,
  job: JobRequirements,
  mode: InterviewMode
): InterviewHypothesisInput[] {
  const hypotheses: InterviewHypothesisInput[] = [];
  const years = candidate.experienceYears || 0;

  // Career pattern hypotheses
  if (years >= 8 && candidate.currentTitle && !/senior|lead|principal|staff|director|vp|head/i.test(candidate.currentTitle)) {
    hypotheses.push({
      hypothesis: `${years} years experience but title "${candidate.currentTitle}" lacks seniority markers. May have limited leadership scope or be in an IC-heavy org.`,
      source: "career_pattern",
    });
  }

  // Skill gap hypotheses for job-fit modes
  if ((mode === "JOB_FIT" || mode === "HYBRID") && job.skillsRequired?.length) {
    const candidateSkills = new Set((candidate.skills || []).map((s) => s.toLowerCase()));
    const missingRequired = job.skillsRequired.filter(
      (s) => !candidateSkills.has(s.toLowerCase())
    );
    if (missingRequired.length > 0) {
      hypotheses.push({
        hypothesis: `Required skills not listed on resume: ${missingRequired.join(", ")}. May have unlisted experience or genuine gap.`,
        source: "skill_gap",
      });
    }
  }

  // Experience depth hypothesis
  if (candidate.experiences?.length) {
    const shortStints = candidate.experiences.filter((exp) => {
      if (!exp.startDate || !exp.endDate) return false;
      const start = new Date(exp.startDate);
      const end = new Date(exp.endDate);
      const months = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return months < 12;
    });
    if (shortStints.length >= 2) {
      hypotheses.push({
        hypothesis: `Multiple roles under 12 months. May indicate job-hopping pattern or contract work. Investigate stability and reasons for departures.`,
        source: "career_pattern",
      });
    }

    const longStint = candidate.experiences.find((exp) => {
      if (!exp.startDate) return false;
      const start = new Date(exp.startDate);
      const end = exp.endDate ? new Date(exp.endDate) : new Date();
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
      return years >= 5;
    });
    if (longStint) {
      hypotheses.push({
        hypothesis: `5+ years at ${longStint.company || "one company"}. Strong depth but may lack exposure to different tech stacks, team structures, or company stages.`,
        source: "career_pattern",
      });
    }
  }

  // Resume text analysis
  if (candidate.resumeText) {
    const text = candidate.resumeText.toLowerCase();
    if (text.includes("led") || text.includes("managed") || text.includes("directed")) {
      hypotheses.push({
        hypothesis: `Resume uses leadership language ("led", "managed"). Verify actual scope: people management vs. project coordination vs. tech leadership.`,
        source: "resume_analysis",
      });
    }
  }

  return hypotheses;
}

/**
 * Convert an interview plan to system prompt context for Gemini Live.
 */
export function planToSystemContext(plan: InterviewPlan): string {
  const sections = plan.sections
    .map(
      (s, i) =>
        `Section ${i + 1}: ${s.skillModule} (${s.category})
  - Objective: ${s.objective || `Assess ${s.skillModule.toLowerCase()}`}
  - Ask ${s.targetQuestions} questions, starting at ${s.difficultyStart} difficulty
  - Key topics to probe: ${s.keyTopicsFromResume.join(", ") || "general"}
  - Scoring: ${s.scoringRubric}
  - Duration target: ~${s.estimatedDuration} minutes
  ${s.entryCondition ? `- Entry condition: ${s.entryCondition}` : ""}`
    )
    .join("\n\n");

  const hypothesesBlock = plan.hypotheses?.length
    ? `\nHYPOTHESES TO TEST:
Your primary mission is to confirm, refute, or gather evidence on each of these hypotheses through your questions. Do NOT state these hypotheses to the candidate. Use targeted questions to test them naturally.

${plan.hypotheses.map((h, i) => `  H${i + 1}. [${h.source}] ${h.hypothesis}`).join("\n")}

After each substantive answer, internally note which hypotheses were addressed and whether evidence supports or contradicts them.`
    : "";

  const objectivesBlock = plan.recruiterObjectives?.length
    ? `\nRECRUITER OBJECTIVES (you MUST investigate these):
${plan.recruiterObjectives.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}`
    : "";

  const screeningBlock = plan.customScreeningQuestions?.length
    ? `\nMANDATORY SCREENING QUESTIONS (ask these verbatim at appropriate points):
${plan.customScreeningQuestions.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}`
    : "";

  return `
INTERVIEW PLAN — Mode: ${plan.mode}
Follow this structure while maintaining natural conversation flow.

${plan.personalizedContext}
${hypothesesBlock}
${objectivesBlock}
${screeningBlock}

DIFFICULTY STRATEGY: ${plan.difficultyStrategy}

OPENING: ${plan.openingInstruction}

SECTIONS:
${sections}

CLOSING: ${plan.closingInstruction}

INTERVIEWER BEHAVIOR RULES:
- Ask ONE question at a time. Wait for the candidate's full response before continuing.
- ACKNOWLEDGE before advancing: After every response, provide a 1-sentence acknowledgment, then ask the next question.
- FOLLOW-UP LOGIC:
  * Strong, specific answer → Go deeper ("What were the tradeoffs?", "How did you measure impact?")
  * Vague answer → Probe ("Can you give a specific example?", "Walk me through the actual steps.")
  * Contradicts prior statement → Clarify ("Earlier you mentioned X, but now it sounds like Y. Can you help me reconcile?")
  * Weak/evasive → One more attempt, then move on and note it.
  * Unexpected depth → Explore further, allocate extra time.
- SILENCE: Wait 5s before prompting. After 15s: "Would you like me to rephrase?" After 30s: move on.
- TIME: At 80% of total time, transition to closing section. At 95%, begin wrap-up.
- TRACK these signals: specificity (names/dates/numbers), ownership language ("I" vs "we"), structured thinking, consistency with resume, depth of explanation.
- Use the adaptive difficulty tools (adjustDifficulty, moveToNextSection) as appropriate.
- Call endInterview when all sections are covered or time is running low.
- Total target: ${plan.totalQuestions} questions across ${plan.sections.length} sections in ~${plan.totalDuration} minutes.
`;
}

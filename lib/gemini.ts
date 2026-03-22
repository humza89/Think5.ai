import { GoogleGenerativeAI } from "@google/generative-ai";
import { computeContentHash } from "./versioning";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const SCORER_MODEL_VERSION = "gemini-1.5-pro";

interface TranscriptEntry {
  role: "interviewer" | "candidate";
  content: string;
  timestamp?: string;
}

interface CandidateProfile {
  fullName: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: string[] | any;
  experienceYears?: number | null;
  resumeText?: string | null;
}

interface SkillRating {
  skill: string;
  rating: number; // 0-10
  description: string;
  evidence: string;
}

interface SoftSkillRating {
  skill: string;
  rating: number; // 0-10
  description: string;
}

export interface RiskSignal {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  evidence: string;
  confidence: string;
}

export interface HypothesisOutcome {
  hypothesis: string;
  outcome: "confirmed" | "refuted" | "inconclusive";
  evidence: string;
}

export interface EvidenceHighlight {
  type: "strength" | "concern" | "contradiction" | "impressive";
  summary: string;
  transcriptRange?: { startIdx: number; endIdx: number };
}

export interface InterviewReportData {
  technicalSkills: SkillRating[];
  softSkills: SoftSkillRating[];
  domainExpertise: number | null;
  clarityStructure: number | null;
  problemSolving: number | null;
  communicationScore: number | null;
  measurableImpact: number | null;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  recommendation: string; // STRONG_YES | YES | MAYBE | NO | STRONG_NO
  hiringAdvice: string;
  overallScore: number | null;
  integrityScore: number | null;
  integrityFlags: any[] | null;
  // Phase 1: Enhanced dimension scores
  professionalExperience: number | null;
  roleFit: number | null;
  culturalFit: number | null;
  thinkingJudgment: number | null;
  // Phase 1: Evidence & confidence
  confidenceLevel: string | null; // HIGH/MEDIUM/LOW
  headline: string | null; // One-line recruiter summary
  riskSignals: RiskSignal[];
  hypothesisOutcomes: HypothesisOutcome[];
  evidenceHighlights: EvidenceHighlight[];
  // Phase 1: Job-fit (optional)
  jobMatchScore: number | null;
  requirementMatches: Array<{ skillName: string; importance: string; matchLevel: string; evidence: string }> | null;
  environmentFitNotes: string | null;
}

const REPORT_GENERATION_PROMPT = `You are Aria, an elite AI interview analyst for Think5. Your role is to analyze interview transcripts and produce enterprise-grade, evidence-linked candidate assessments that surpass platforms like micro1 and mercor.

Analyze the following interview transcript, candidate profile, and hypotheses to generate a detailed assessment report.

CANDIDATE PROFILE:
{candidateProfile}

INTERVIEW TRANSCRIPT:
{transcript}

{hypotheses}

{jobContext}

Each transcript entry is numbered (e.g., [#0], [#1], ...). Use these indices when referencing evidence to enable click-to-transcript navigation in the report.

Generate a JSON assessment report. Every score MUST be justified with specific evidence from the transcript.

{
  "technicalSkills": [
    {
      "skill": "Name of technical skill assessed",
      "rating": <0-10 integer>,
      "description": "What was assessed and how the candidate performed",
      "evidence": "Direct quote or specific reference from transcript"
    }
  ],
  "softSkills": [
    {
      "skill": "Communication|Problem Solving Approach|Adaptability|Collaboration|Leadership",
      "rating": <0-10 integer>,
      "description": "Assessment of this soft skill"
    }
  ],
  "domainExpertise": <0-100>,
  "clarityStructure": <0-100>,
  "problemSolving": <0-100>,
  "communicationScore": <0-100>,
  "measurableImpact": <0-100>,

  "professionalExperience": <0-100, authenticity and depth of experience, seniority alignment>,
  "roleFit": <0-100 or null if no job context, match to specific job requirements>,
  "culturalFit": <0-100, ownership, collaboration, adaptability, coachability signals>,
  "thinkingJudgment": <0-100, structured thinking, tradeoff awareness, decision quality>,

  "headline": "One sentence summary for recruiter quick scan, e.g. 'Strong backend engineer with genuine distributed systems experience. Weaker on frontend and team leadership.'",

  "confidenceLevel": "HIGH|MEDIUM|LOW — based on depth of transcript evidence. SHORT interviews or many incomplete answers = LOW.",

  "summary": "2-3 paragraph executive summary for recruiters. What this person CAN do, at what LEVEL, in what CONTEXT. Key strengths with evidence. Key gaps. Specific recruiter action.",
  "strengths": ["Strength with evidence"],
  "areasToImprove": ["Area with evidence"],
  "recommendation": "STRONG_YES|YES|MAYBE|NO|STRONG_NO",
  "hiringAdvice": "Detailed guidance: what roles they'd excel in, concerns, follow-up questions, conditional factors.",
  "overallScore": <0-100>,

  "riskSignals": [
    {
      "type": "inconsistency|inflated_claim|shallow_reasoning|evasion|buzzword_reliance|weak_ownership",
      "severity": "LOW|MEDIUM|HIGH",
      "evidence": "Specific transcript reference",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ],

  "hypothesisOutcomes": [
    {
      "hypothesis": "The hypothesis text",
      "outcome": "confirmed|refuted|inconclusive",
      "evidence": "What the candidate said that supports this outcome"
    }
  ],

  "evidenceHighlights": [
    {
      "type": "strength|concern|contradiction|impressive",
      "summary": "Brief description of this moment",
      "transcriptRange": {"startIdx": <first transcript entry index (0-based)>, "endIdx": <last transcript entry index (inclusive)>}
    }
  ],

  "jobMatchScore": <0-100 or null if no job context>,
  "requirementMatches": [{"skillName": "string", "importance": "REQUIRED|PREFERRED|NICE_TO_HAVE", "matchLevel": "met|partially_met|not_met|not_assessed", "evidence": "string"}] or null,
  "environmentFitNotes": "string or null",

  "integrityScore": <0-100 or null>,
  "integrityFlags": []
}

SCORING GUIDELINES:
- Technical skills: 0-3 = below expectations, 4-6 = meets expectations, 7-8 = exceeds expectations, 9-10 = exceptional
- Dimension scores (0-100): 0-30 = poor, 31-50 = below average, 51-70 = competent, 71-85 = strong, 86-100 = exceptional
- Overall score: Weighted — 25% technical/functional, 20% professional experience, 20% thinking/judgment, 15% communication, 10% cultural fit, 10% role fit (if applicable)
- confidenceLevel: HIGH = deep transcript with specific examples and verified claims. MEDIUM = decent coverage but some gaps. LOW = short interview, many vague answers, or significant areas unassessed.
- Recommendation: STRONG_YES = top 5%, YES = clearly qualified, MAYBE = borderline, NO = not qualified, STRONG_NO = significant concerns

RISK SIGNAL DETECTION:
- Look for inconsistencies between resume claims and interview answers
- Flag inflated claims (title vs. actual described scope)
- Note shallow reasoning (describes "what" but never "why" or "how")
- Detect evasion (repeatedly deflecting certain topics)
- Identify buzzword reliance (uses terms without demonstrating understanding)
- Flag weak ownership (always "we" never "I", can't describe personal contribution)

IMPORTANT:
- Every score MUST link to specific evidence. If no evidence exists, score null and note in confidenceLevel.
- If hypotheses were provided, evaluate each one — confirmed, refuted, or inconclusive with evidence.
- The headline must be scannable in 3 seconds by a busy recruiter.
- Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;

/**
 * Returns the SHA-256 hash of the scoring prompt template.
 */
export function getScorerPromptHash(): string {
  return computeContentHash(REPORT_GENERATION_PROMPT);
}

interface IntegrityEvent {
  type: string;
  description: string;
  timestamp: string;
}

interface ReportGenerationOptions {
  hypotheses?: Array<{ hypothesis: string; source: string }>;
  jobTitle?: string;
  jobDescription?: string;
  jobSkillsRequired?: string[];
  jobSkillsPreferred?: string[];
  mode?: string;
}

export async function generateInterviewReport(
  transcript: TranscriptEntry[],
  candidateProfile: CandidateProfile,
  integrityEvents?: IntegrityEvent[] | null,
  options?: ReportGenerationOptions
): Promise<InterviewReportData> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = genAI.getGenerativeModel({ model: SCORER_MODEL_VERSION });

  // Format transcript for the prompt
  const formattedTranscript = transcript
    .map(
      (entry, idx) =>
        `[#${idx} ${entry.role.toUpperCase()}${entry.timestamp ? ` @ ${entry.timestamp}` : ""}]: ${entry.content}`
    )
    .join("\n\n");

  // Format candidate profile
  const profileStr = [
    `Name: ${candidateProfile.fullName}`,
    candidateProfile.currentTitle ? `Title: ${candidateProfile.currentTitle}` : null,
    candidateProfile.currentCompany ? `Company: ${candidateProfile.currentCompany}` : null,
    candidateProfile.experienceYears ? `Experience: ${candidateProfile.experienceYears} years` : null,
    candidateProfile.skills
      ? `Skills: ${Array.isArray(candidateProfile.skills) ? candidateProfile.skills.join(", ") : candidateProfile.skills}`
      : null,
    candidateProfile.resumeText
      ? `Resume Summary (first 2000 chars): ${candidateProfile.resumeText.substring(0, 2000)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Format hypotheses if available
  let hypothesesSection = "";
  if (options?.hypotheses?.length) {
    const hypothesesStr = options.hypotheses
      .map((h, i) => `  H${i + 1}. [${h.source}] ${h.hypothesis}`)
      .join("\n");
    hypothesesSection = `PRE-INTERVIEW HYPOTHESES TO EVALUATE:
${hypothesesStr}

For each hypothesis, determine whether the interview evidence confirms, refutes, or leaves it inconclusive. Include your reasoning in hypothesisOutcomes.`;
  }

  // Format job context if available
  let jobContextSection = "";
  if (options?.jobTitle) {
    jobContextSection = `JOB CONTEXT (evaluate candidate fit against this role):
- Title: ${options.jobTitle}
${options.jobDescription ? `- Description: ${options.jobDescription.slice(0, 1000)}` : ""}
${options.jobSkillsRequired?.length ? `- Required Skills: ${options.jobSkillsRequired.join(", ")}` : ""}
${options.jobSkillsPreferred?.length ? `- Preferred Skills: ${options.jobSkillsPreferred.join(", ")}` : ""}

Evaluate jobMatchScore, requirementMatches, and environmentFitNotes for this specific role.`;
  }

  // Format integrity events if available
  let integritySection = "";
  if (integrityEvents && integrityEvents.length > 0) {
    const eventsStr = integrityEvents
      .map((e) => `- [${e.type}] ${e.description} (${e.timestamp})`)
      .join("\n");
    integritySection = `\n\nINTEGRITY EVENTS (proctoring data collected during interview):\n${eventsStr}\n\nINTEGRITY SCORING GUIDELINES:
Start at 100 and deduct based on events:
- tab_switch: -5 per occurrence
- focus_lost: -3 per occurrence
- paste_detected: -10 per occurrence (strong cheating indicator)
- copy_detected: -2 per occurrence
- right_click: -2 per occurrence
- devtools_attempt: -15 per occurrence (strong cheating indicator)
- fullscreen_exit: -8 per occurrence
- keyboard_shortcut: -3 per occurrence
- webcam_lost: -5 per occurrence
- webcam_denied: -10

Minimum score is 0. If 3+ paste or devtools events, add a meta-flag: {type: "high_risk", description: "Multiple cheating indicators detected"}.`;
  }

  const prompt = REPORT_GENERATION_PROMPT
    .replace("{candidateProfile}", profileStr)
    .replace("{transcript}", formattedTranscript)
    .replace("{hypotheses}", hypothesesSection)
    .replace("{jobContext}", jobContextSection) + integritySection;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  // Parse JSON from response (handle potential markdown wrapping)
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const reportData: InterviewReportData = JSON.parse(jsonStr);

  // Validate and clamp all scores
  reportData.overallScore = clampScore(reportData.overallScore, 0, 100);
  reportData.domainExpertise = clampScore(reportData.domainExpertise, 0, 100);
  reportData.clarityStructure = clampScore(reportData.clarityStructure, 0, 100);
  reportData.problemSolving = clampScore(reportData.problemSolving, 0, 100);
  reportData.communicationScore = clampScore(reportData.communicationScore, 0, 100);
  reportData.measurableImpact = clampScore(reportData.measurableImpact, 0, 100);
  reportData.integrityScore = clampScore(reportData.integrityScore, 0, 100);
  // Phase 1 dimension scores
  reportData.professionalExperience = clampScore(reportData.professionalExperience, 0, 100);
  reportData.roleFit = clampScore(reportData.roleFit, 0, 100);
  reportData.culturalFit = clampScore(reportData.culturalFit, 0, 100);
  reportData.thinkingJudgment = clampScore(reportData.thinkingJudgment, 0, 100);
  reportData.jobMatchScore = clampScore(reportData.jobMatchScore, 0, 100);

  // Validate recommendation
  const validRecommendations = ["STRONG_YES", "YES", "MAYBE", "NO", "STRONG_NO"];
  if (!validRecommendations.includes(reportData.recommendation)) {
    reportData.recommendation = "MAYBE";
  }

  // Validate confidence level
  const validConfidence = ["HIGH", "MEDIUM", "LOW"];
  if (!reportData.confidenceLevel || !validConfidence.includes(reportData.confidenceLevel)) {
    reportData.confidenceLevel = "MEDIUM";
  }

  // Ensure arrays exist
  reportData.riskSignals = reportData.riskSignals || [];
  reportData.hypothesisOutcomes = reportData.hypothesisOutcomes || [];
  reportData.evidenceHighlights = reportData.evidenceHighlights || [];

  return reportData;
}

function clampScore(value: number | null | undefined, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  return Math.max(min, Math.min(max, value));
}

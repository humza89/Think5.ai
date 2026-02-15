import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
}

const REPORT_GENERATION_PROMPT = `You are Aria, an elite AI interview analyst for think5, a platform that sources human intelligence for training the world's most advanced AI systems. Your role is to analyze interview transcripts and produce comprehensive, enterprise-grade candidate assessments that match the quality of platforms like micro1 and mercor.

Analyze the following interview transcript and candidate profile to generate a detailed assessment report.

CANDIDATE PROFILE:
{candidateProfile}

INTERVIEW TRANSCRIPT:
{transcript}

Generate a JSON assessment report with the following structure. Be thorough, specific, and cite evidence from the transcript for each rating.

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
  "domainExpertise": <0-100 float, depth of domain knowledge>,
  "clarityStructure": <0-100 float, how clearly they structure thoughts and answers>,
  "problemSolving": <0-100 float, analytical and problem-solving ability>,
  "communicationScore": <0-100 float, verbal communication effectiveness>,
  "measurableImpact": <0-100 float, evidence of measurable impact in past work>,
  "summary": "2-3 paragraph executive summary written for recruiters. Cover the candidate's strengths, gaps, and overall fit. Be specific and actionable.",
  "strengths": ["Strength 1 with brief explanation", "Strength 2", ...],
  "areasToImprove": ["Area 1 with brief explanation", "Area 2", ...],
  "recommendation": "STRONG_YES|YES|MAYBE|NO|STRONG_NO",
  "hiringAdvice": "Detailed paragraph of guidance for the recruiter: what roles this candidate would excel in, potential concerns, suggested follow-up questions, and overall hiring recommendation with reasoning.",
  "overallScore": <0-100 composite score>,
  "integrityScore": <0-100 or null if unable to assess>,
  "integrityFlags": []
}

SCORING GUIDELINES:
- Technical skills: 0-3 = below expectations, 4-6 = meets expectations, 7-8 = exceeds expectations, 9-10 = exceptional
- Dimension scores (0-100): 0-30 = poor, 31-50 = below average, 51-70 = competent, 71-85 = strong, 86-100 = exceptional
- Overall score: Weighted composite — 40% technical, 20% problem solving, 15% communication, 15% domain expertise, 10% measurable impact
- Recommendation: STRONG_YES = top 5% candidate, YES = clearly qualified, MAYBE = borderline/needs more info, NO = not qualified, STRONG_NO = significant concerns

IMPORTANT:
- Be specific and evidence-based. Every rating must be justified.
- If the transcript is short or lacks depth in an area, note this and adjust confidence accordingly.
- The summary and hiringAdvice should be actionable and written for a busy recruiter.
- Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;

export async function generateInterviewReport(
  transcript: TranscriptEntry[],
  candidateProfile: CandidateProfile
): Promise<InterviewReportData> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  // Format transcript for the prompt
  const formattedTranscript = transcript
    .map(
      (entry) =>
        `[${entry.role.toUpperCase()}${entry.timestamp ? ` @ ${entry.timestamp}` : ""}]: ${entry.content}`
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

  const prompt = REPORT_GENERATION_PROMPT
    .replace("{candidateProfile}", profileStr)
    .replace("{transcript}", formattedTranscript);

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

  // Validate and clamp scores
  reportData.overallScore = clampScore(reportData.overallScore, 0, 100);
  reportData.domainExpertise = clampScore(reportData.domainExpertise, 0, 100);
  reportData.clarityStructure = clampScore(reportData.clarityStructure, 0, 100);
  reportData.problemSolving = clampScore(reportData.problemSolving, 0, 100);
  reportData.communicationScore = clampScore(reportData.communicationScore, 0, 100);
  reportData.measurableImpact = clampScore(reportData.measurableImpact, 0, 100);
  reportData.integrityScore = clampScore(reportData.integrityScore, 0, 100);

  // Validate recommendation
  const validRecommendations = ["STRONG_YES", "YES", "MAYBE", "NO", "STRONG_NO"];
  if (!validRecommendations.includes(reportData.recommendation)) {
    reportData.recommendation = "MAYBE";
  }

  return reportData;
}

function clampScore(value: number | null | undefined, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  return Math.max(min, Math.min(max, value));
}

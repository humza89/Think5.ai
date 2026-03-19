import { prisma } from "@/lib/prisma";

interface RiskFlag {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface RiskSignals {
  riskScore: number;
  riskFlags: RiskFlag[];
  profileCompleteness: number;
}

export async function computeCandidateRiskSignals(candidateId: string): Promise<RiskSignals> {
  // Fetch candidate with all related data
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      candidateSkills: true,
      candidateExperiences: true,
      candidateEducation: true,
      documents: true,
      jobPreferences: true,
    },
  });

  if (!candidate) {
    return { riskScore: 100, riskFlags: [{ type: "not_found", severity: "high", message: "Candidate not found" }], profileCompleteness: 0 };
  }

  const flags: RiskFlag[] = [];
  const totalFields = 10;
  let filledFields = 0;

  // Check profile completeness
  if (candidate.fullName) filledFields++;
  if (candidate.email) filledFields++;
  if (candidate.phone) filledFields++;
  if (candidate.linkedinUrl) filledFields++;
  if (candidate.currentTitle) filledFields++;
  if (candidate.currentCompany) filledFields++;
  if (candidate.resumeUrl || candidate.resumeText) filledFields++;
  if (candidate.candidateSkills.length > 0) filledFields++;
  if (candidate.candidateExperiences.length > 0) filledFields++;
  if (candidate.candidateEducation.length > 0) filledFields++;

  const completenessScore = Math.round((filledFields / totalFields) * 100);

  // Flag low completeness
  if (completenessScore < 50) {
    flags.push({ type: "low_completeness", severity: "high", message: `Profile only ${completenessScore}% complete` });
  } else if (completenessScore < 75) {
    flags.push({ type: "low_completeness", severity: "medium", message: `Profile ${completenessScore}% complete` });
  }

  // Flag missing critical fields
  if (!candidate.resumeUrl && !candidate.resumeText) {
    flags.push({ type: "no_resume", severity: "high", message: "No resume uploaded" });
  }
  if (!candidate.linkedinUrl) {
    flags.push({ type: "no_linkedin", severity: "medium", message: "No LinkedIn URL provided" });
  }
  if (!candidate.email) {
    flags.push({ type: "no_email", severity: "high", message: "No email address" });
  }
  if (candidate.candidateSkills.length === 0) {
    flags.push({ type: "no_skills", severity: "medium", message: "No skills listed" });
  }
  if (candidate.candidateExperiences.length === 0) {
    flags.push({ type: "no_experience", severity: "medium", message: "No work experience listed" });
  }

  // Check LinkedIn consistency if score exists
  if (candidate.linkedinConsistencyScore !== null && candidate.linkedinConsistencyScore < 50) {
    flags.push({ type: "linkedin_mismatch", severity: "high", message: `LinkedIn consistency score: ${candidate.linkedinConsistencyScore}%` });
  }

  // Compute composite risk score (0 = highest risk, 100 = lowest risk)
  let riskScore = 100;
  for (const flag of flags) {
    if (flag.severity === "high") riskScore -= 20;
    else if (flag.severity === "medium") riskScore -= 10;
    else riskScore -= 5;
  }
  riskScore = Math.max(0, Math.min(100, riskScore));

  return { riskScore, riskFlags: flags, profileCompleteness: completenessScore };
}

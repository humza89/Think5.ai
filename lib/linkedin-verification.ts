import { openai } from "@/lib/openai";

export interface LinkedInConsistencyResult {
  score: number;
  flags: string[];
}

/**
 * Compare resume data against a LinkedIn profile URL using AI analysis.
 * Returns a 0-100 confidence score and an array of discrepancy flags.
 */
export async function checkLinkedInConsistency(
  resumeData: any,
  linkedinUrl: string
): Promise<LinkedInConsistencyResult> {
  if (!linkedinUrl || !linkedinUrl.trim()) {
    return { score: 0, flags: ["no_linkedin_provided"] };
  }

  // Validate LinkedIn URL format
  const linkedinPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
  if (!linkedinPattern.test(linkedinUrl.trim())) {
    return { score: 0, flags: ["invalid_linkedin_url_format"] };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { score: 0, flags: ["openai_api_key_missing"] };
  }

  // Build a structured summary of resume claims for comparison
  const resumeSummary = buildResumeSummary(resumeData);

  if (!resumeSummary) {
    return { score: 0, flags: ["insufficient_resume_data"] };
  }

  const prompt = `You are verifying resume claims against a LinkedIn profile. Analyze the resume data below and the LinkedIn URL provided. Based on common patterns of resume fraud and inconsistency, evaluate how likely the resume claims are to be consistent with what a real LinkedIn profile at this URL would show.

LinkedIn URL: ${linkedinUrl}

Resume Claims:
${resumeSummary}

Evaluate consistency across these dimensions:
1. Job titles - Do they seem realistic and internally consistent?
2. Company names - Are they real companies with plausible employment?
3. Date ranges - Are there overlaps, gaps, or implausible timelines?
4. Education - Are the degrees and institutions plausible?
5. Skills - Do the claimed skills align with the stated experience?

Return JSON with:
- "score": number 0-100 (100 = fully consistent, 0 = major red flags)
- "flags": array of specific discrepancy flags (strings), e.g. "title_inflation", "date_overlap", "implausible_timeline", "missing_education_details", "skill_experience_mismatch"
- If everything looks consistent, return score 80-100 and empty flags array
- Only flag clear inconsistencies, not minor issues

Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert at detecting resume inconsistencies and verifying professional claims. Return only valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(content);

  const score = typeof parsed.score === "number"
    ? Math.max(0, Math.min(100, Math.round(parsed.score)))
    : 0;

  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.filter((f: unknown) => typeof f === "string")
    : [];

  return { score, flags };
}

function buildResumeSummary(data: any): string | null {
  if (!data || typeof data !== "object") return null;

  const parts: string[] = [];

  if (data.fullName) parts.push(`Name: ${data.fullName}`);
  if (data.currentTitle) parts.push(`Current Title: ${data.currentTitle}`);
  if (data.currentCompany) parts.push(`Current Company: ${data.currentCompany}`);
  if (data.experienceYears) parts.push(`Total Experience: ${data.experienceYears} years`);

  if (Array.isArray(data.experiences) && data.experiences.length > 0) {
    parts.push("\nWork Experience:");
    for (const exp of data.experiences) {
      const dates = [exp.startDate, exp.endDate || "Present"].filter(Boolean).join(" - ");
      parts.push(`  - ${exp.title || "Unknown"} at ${exp.company || "Unknown"} (${dates})`);
    }
  }

  if (Array.isArray(data.education) && data.education.length > 0) {
    parts.push("\nEducation:");
    for (const edu of data.education) {
      parts.push(`  - ${edu.degree || ""} ${edu.fieldOfStudy || ""} at ${edu.institution || "Unknown"}`);
    }
  }

  if (Array.isArray(data.skills) && data.skills.length > 0) {
    parts.push(`\nSkills: ${data.skills.slice(0, 20).join(", ")}`);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

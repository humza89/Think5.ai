import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("Warning: OPENAI_API_KEY is not set. AI features will not work.");
}

// Month name/abbreviation → number mapping
const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02",
  mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11",
  dec: "12", december: "12",
};

/**
 * Normalize various date formats to MM/YYYY.
 * Handles: "Oct 2022", "October 2022", "2022-10", "10-2022", "10/2022", "2022", etc.
 */
function normalizeDate(value: unknown): string {
  if (value == null) return "";
  // Handle numbers (e.g., year as number from AI)
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") return "";
  const v = raw.trim();
  if (!v || v.toLowerCase() === "present" || v.toLowerCase() === "current") return "";

  // Already MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(v)) {
    const [m, y] = v.split("/");
    return `${m.padStart(2, "0")}/${y}`;
  }

  // "Oct 2022", "October 2022", "Oct. 2022", "Jun, 2022"
  const monthName = v.match(/^([A-Za-z]+)[.,]?\s+(\d{4})$/);
  if (monthName) {
    const mm = MONTH_MAP[monthName[1].toLowerCase()];
    if (mm) return `${mm}/${monthName[2]}`;
  }

  // "2022-10" (ISO partial)
  const isoPartial = v.match(/^(\d{4})-(\d{1,2})$/);
  if (isoPartial) return `${isoPartial[2].padStart(2, "0")}/${isoPartial[1]}`;

  // "10-2022"
  const dashReverse = v.match(/^(\d{1,2})-(\d{4})$/);
  if (dashReverse) return `${dashReverse[1].padStart(2, "0")}/${dashReverse[2]}`;

  // "2022-10-01" (full ISO)
  const isoFull = v.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (isoFull) return `${isoFull[2]}/${isoFull[1]}`;

  // Just a year "2022"
  if (/^\d{4}$/.test(v)) return `01/${v}`;

  // MM/DD/YYYY
  const mdySlash = v.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (mdySlash) return `${mdySlash[1].padStart(2, "0")}/${mdySlash[2]}`;

  return "";
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: text,
  });

  return response.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

export interface ParsedResumeData {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experienceYears: number | null;
  industries: string[];
  summary: string;
  experiences: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    location: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startDate: string;
    endDate: string;
  }>;
  certifications: Array<{
    name: string;
    issuingOrganization: string;
    issueDate: string;
    expiryDate: string;
  }>;
  skillDetails: Array<{
    name: string;
    proficiency: number;
    category: string;
  }>;
}

export async function parseResumeWithAI(resumeText: string): Promise<ParsedResumeData> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const prompt = `Extract comprehensive information from this resume and return it as JSON with these exact keys:

- fullName: person's full name
- email: email address
- phone: phone number
- currentTitle: most recent or current job title
- currentCompany: most recent or current company name
- skills: flat array of all technical skills, tools, and technologies (strings)
- experienceYears: approximate total years of professional experience (number)
- industries: array of industries they have experience in
- summary: a brief 2-3 sentence professional summary

- experiences: array of work experiences, ordered most recent first. Each entry:
  - company: company name
  - title: job title
  - startDate: start date in MM/YYYY format (e.g. "06/2020")
  - endDate: end date in MM/YYYY format, or "" if current
  - isCurrent: true if this is their current position (no end date or says "Present")
  - description: brief description of responsibilities and achievements (2-3 sentences)
  - location: work location if mentioned, or ""

- education: array of education entries, ordered most recent first. Each entry:
  - institution: school/university name
  - degree: degree type (e.g. "Bachelor of Science", "MBA", "Ph.D.")
  - fieldOfStudy: major or field of study
  - startDate: start date in MM/YYYY format, or ""
  - endDate: end date or graduation date in MM/YYYY format, or ""

- certifications: array of certifications/licenses. Each entry:
  - name: certification name
  - issuingOrganization: issuing body
  - issueDate: issue date in MM/YYYY format, or ""
  - expiryDate: expiry date in MM/YYYY format, or ""

- skillDetails: array of skills with proficiency estimates. Each entry:
  - name: skill name (must match an entry in the skills array)
  - proficiency: estimated proficiency 1-5 (5=expert with many years/lead roles, 4=advanced, 3=intermediate, 2=familiar, 1=basic/mentioned once)
  - category: one of "Programming Language", "Framework", "Database", "Cloud", "Tool", "Methodology", "Soft Skill", or "Other"

If a field cannot be extracted, use null for scalars, "" for strings, or [] for arrays.

Resume text:
${resumeText}

Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert resume parser. Extract all structured information accurately and return only valid JSON. Be thorough — extract every work experience, education entry, certification, and skill you can find.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(content);

  // Debug: log raw AI dates
  console.log("[Resume Parser] Raw AI experience dates:",
    JSON.stringify((parsed.experiences || []).map((e: Record<string, unknown>) => ({ company: e.company, startDate: e.startDate, endDate: e.endDate }))));

  // Normalize experience dates
  const experiences = (parsed.experiences || []).map((exp: Record<string, unknown>) => ({
    ...exp,
    startDate: normalizeDate(exp.startDate as string),
    endDate: normalizeDate(exp.endDate as string),
  }));

  console.log("[Resume Parser] Normalized experience dates:",
    JSON.stringify(experiences.map((e: Record<string, unknown>) => ({ company: e.company, startDate: e.startDate, endDate: e.endDate }))));

  // Normalize education dates
  const education = (parsed.education || []).map((edu: Record<string, unknown>) => ({
    ...edu,
    startDate: normalizeDate(edu.startDate as string),
    endDate: normalizeDate(edu.endDate as string),
  }));

  // Normalize certification dates
  const certifications = (parsed.certifications || []).map((cert: Record<string, unknown>) => ({
    ...cert,
    issueDate: normalizeDate(cert.issueDate as string),
    expiryDate: normalizeDate(cert.expiryDate as string),
  }));

  return {
    fullName: parsed.fullName || null,
    email: parsed.email || null,
    phone: parsed.phone || null,
    currentTitle: parsed.currentTitle || null,
    currentCompany: parsed.currentCompany || null,
    skills: parsed.skills || [],
    experienceYears: parsed.experienceYears ?? null,
    industries: parsed.industries || [],
    summary: parsed.summary || "",
    experiences,
    education,
    certifications,
    skillDetails: parsed.skillDetails || [],
  };
}

export async function generateCandidateSummary(candidate: {
  fullName: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills: string[];
  experienceYears?: number | null;
  industries: string[];
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const prompt = `Generate a concise 2-3 sentence professional summary for this candidate:
Name: ${candidate.fullName}
Current Role: ${candidate.currentTitle || "N/A"} at ${candidate.currentCompany || "N/A"}
Experience: ${candidate.experienceYears || "Unknown"} years
Key Skills: ${candidate.skills.slice(0, 10).join(", ")}
Industries: ${candidate.industries.join(", ")}

The summary should highlight their key expertise, experience level, and industry focus.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 150,
  });

  return response.choices[0].message.content || "";
}

export async function generateMatchReasoning(
  candidate: {
    fullName: string;
    skills: string[];
    experienceYears?: number | null;
    industries: string[];
  },
  role: {
    title: string;
    skillsRequired: string[];
    description: string;
  },
  fitScore: number
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return `${Math.round(fitScore * 100)}% match based on skills and experience alignment.`;
  }

  const prompt = `Explain in 2-3 sentences why this candidate is a ${Math.round(fitScore * 100)}% match for this role:

Candidate:
- Skills: ${candidate.skills.slice(0, 15).join(", ")}
- Experience: ${candidate.experienceYears || "Unknown"} years
- Industries: ${candidate.industries.join(", ")}

Role:
- Title: ${role.title}
- Required Skills: ${role.skillsRequired.slice(0, 15).join(", ")}

Focus on skill overlap, experience level, and industry alignment.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 100,
  });

  return response.choices[0].message.content || `${Math.round(fitScore * 100)}% match`;
}

import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("Warning: OPENAI_API_KEY is not set. AI features will not work.");
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
    experiences: parsed.experiences || [],
    education: parsed.education || [],
    certifications: parsed.certifications || [],
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

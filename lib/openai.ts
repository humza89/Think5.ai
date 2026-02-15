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

export async function parseResumeWithAI(resumeText: string): Promise<{
  fullName: string | null;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experienceYears: number | null;
  industries: string[];
  summary: string;
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const prompt = `Extract the following information from this resume and return it as JSON:
- fullName: person's full name
- email: email address
- phone: phone number
- currentTitle: most recent or current job title
- currentCompany: most recent or current company name
- skills: array of technical skills, tools, and technologies
- experienceYears: approximate total years of professional experience (as a number)
- industries: array of industries they have experience in
- summary: a brief 2-3 sentence professional summary

Resume text:
${resumeText}

Return ONLY valid JSON with these exact keys, no additional text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a resume parser. Extract information and return only valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  return JSON.parse(content);
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

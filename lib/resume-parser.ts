import { parseResumeWithAI } from "./openai";

export async function parseResumeFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    // Use pdf-parse (pure Node.js — works on Vercel serverless)
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as Record<string, unknown>).default || pdfParseModule;
    const result = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
    return result.text;
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    // Use dynamic import for mammoth
    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ buffer });
    return result.value;
  } else {
    throw new Error("Unsupported file type. Please upload PDF or DOCX.");
  }
}

export async function extractCandidateData(resumeText: string) {
  const parsedData = await parseResumeWithAI(resumeText);

  return {
    fullName: parsedData.fullName || "Unknown",
    email: parsedData.email,
    phone: parsedData.phone,
    currentTitle: parsedData.currentTitle,
    currentCompany: parsedData.currentCompany,
    skills: parsedData.skills || [],
    experienceYears: parsedData.experienceYears,
    industries: parsedData.industries || [],
    summary: parsedData.summary || "",
    experiences: parsedData.experiences || [],
    education: parsedData.education || [],
    certifications: parsedData.certifications || [],
    skillDetails: parsedData.skillDetails || [],
  };
}

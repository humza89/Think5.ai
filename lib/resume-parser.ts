import { parseResumeWithAI } from "./openai";

export async function parseResumeFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    // Import pdf-parse internals directly to skip index.js test-file guard
    // (index.js tries to read ./test/data/05-versions-space.pdf on import)
    const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
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

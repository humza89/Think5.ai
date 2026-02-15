import { parseResumeWithAI } from "./openai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export async function parseResumeFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    // Use Python script for PDF parsing (more reliable)
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `resume-${Date.now()}.pdf`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempFile, buffer);

      // Call Python script
      const scriptPath = path.join(process.cwd(), "scripts", "parse-pdf.py");
      const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${tempFile}"`);

      if (stderr) {
        console.error("Python script stderr:", stderr);
      }

      // Parse JSON output
      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.text;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
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
  };
}

import { NextRequest, NextResponse } from "next/server";
import { parseResumeFile, extractCandidateData } from "@/lib/resume-parser";
import { importLinkedInProfile } from "@/lib/linkedin/importer";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { requireRole, handleAuthError } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    await requireRole(["recruiter", "admin"]);

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rateLimitResult = checkRateLimit(`upload:${ip}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many upload requests. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const linkedinUrl = formData.get("linkedinUrl") as string | null;

    let result: any = {};

    // Handle file upload (resume)
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Parse resume
      const resumeText = await parseResumeFile(buffer, file.type);
      const candidateData = await extractCandidateData(resumeText);

      // Save file to disk
      const uploadDir = path.join(process.cwd(), "uploads");
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const filename = `${Date.now()}-${file.name}`;
      const filepath = path.join(uploadDir, filename);
      await writeFile(filepath, buffer);

      result = {
        ...candidateData,
        resumeText,
        resumeUrl: `/uploads/${filename}`,
      };
    }

    // Handle LinkedIn URL
    if (linkedinUrl) {
      try {
        const linkedinData = await importLinkedInProfile(linkedinUrl);

        // Use the rich data from the new importer
        const firstExperience = linkedinData.experiences[0];

        result = {
          ...result,
          fullName: result.fullName || linkedinData.candidate.fullName,
          headline: linkedinData.candidate.headline,
          location: linkedinData.candidate.location,
          currentTitle: result.currentTitle || firstExperience?.title,
          currentCompany: result.currentCompany || firstExperience?.company,
          profileImage: linkedinData.candidate.profilePhotoCdnUrl,
          linkedinUrl,
          // Include all the rich data for the candidate creation
          linkedinProfileData: linkedinData,
        };
      } catch (error) {
        console.error("LinkedIn import error:", error);
        // Continue without LinkedIn data
      }
    }

    if (!file && !linkedinUrl) {
      return NextResponse.json(
        { error: "Please provide either a resume file or LinkedIn URL" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    const authResult = handleAuthError(error);
    if (authResult.status !== 500) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process upload" },
      { status: 500 }
    );
  }
}

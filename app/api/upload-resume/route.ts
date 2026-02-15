import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResumeFile, extractCandidateData } from "@/lib/resume-parser";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const candidateId = formData.get("candidateId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!candidateId) {
      return NextResponse.json(
        { error: "No candidate ID provided" },
        { status: 400 }
      );
    }

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

    // Update candidate with resume data
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        resumeText,
        resumeUrl: `/uploads/${filename}`,
        // Update skills if extracted from resume
        ...(candidateData.skills && candidateData.skills.length > 0 && {
          skills: candidateData.skills,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      resumeUrl: `/uploads/${filename}`,
    });
  } catch (error: any) {
    console.error("Resume upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload resume" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResumeFile, extractCandidateData } from "@/lib/resume-parser";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getAuthenticatedUser, handleAuthError, AuthError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Find or create candidate record
    let candidate = await prisma.candidate.findFirst({
      where: { email: { equals: profile.email, mode: "insensitive" } },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate record not found. Please start onboarding first." },
        { status: 404 }
      );
    }

    // Parse resume text
    const resumeText = await parseResumeFile(buffer, file.type);

    // Extract structured data with AI
    const candidateData = await extractCandidateData(resumeText);

    // Save file to disk
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);

    const fileUrl = `/uploads/${filename}`;

    // Remove old resume document if exists
    await prisma.document.deleteMany({
      where: { candidateId: candidate.id, type: "RESUME" },
    });

    // Create document record
    await prisma.document.create({
      data: {
        candidateId: candidate.id,
        type: "RESUME",
        fileUrl,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        parsedData: candidateData as Record<string, unknown>,
      },
    });

    // Update candidate with resume data
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resumeText,
        resumeUrl: fileUrl,
        onboardingStep: Math.max(candidate.onboardingStep, 2),
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl,
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      parsedData: candidateData,
    });
  } catch (error: unknown) {
    const authResult = handleAuthError(error);
    if (authResult.status !== 500) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    console.error("Resume upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload resume" },
      { status: 500 }
    );
  }
}

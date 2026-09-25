import { NextRequest, NextResponse } from "next/server";
import { signedResumeUrl, DEFAULT_SIGNED_URL_TTL_SECONDS } from "@/lib/storage-urls";
import { prisma } from "@/lib/prisma";
import { parseResumeFile, extractCandidateData } from "@/lib/resume-parser";
import { requireCandidateAccess, handleAuthError } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    await requireCandidateAccess(id);

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log(`Parsing resume for candidate ${id}...`);

    // Parse the resume to extract text
    const resumeText = await parseResumeFile(buffer, file.type);
    console.log(`Resume text extracted (${resumeText.length} characters)`);

    // Upload the file to get a URL
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);

    const uploadResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/upload`,
      {
        method: "POST",
        body: uploadFormData,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload resume file");
    }

    const uploadData = await uploadResponse.json();
    const resumeUrl = uploadData.resumeUrl || uploadData.url;
    console.log(`Resume uploaded: ${resumeUrl}`);

    // Extract candidate data using AI
    console.log(`Extracting candidate data from resume...`);
    const extractedData = await extractCandidateData(resumeText);
    console.log(`Candidate data extracted:`, extractedData);

    // Prepare update data - merge with existing data (don't overwrite if field is empty)
    const updateData: any = {
      resumeUrl,
      resumeText,
    };

    // Only update fields if they have meaningful values
    if (extractedData.fullName && extractedData.fullName !== "Unknown") {
      updateData.fullName = extractedData.fullName;
    }

    if (extractedData.email) {
      updateData.email = extractedData.email;
    }

    if (extractedData.phone) {
      updateData.phone = extractedData.phone;
    }

    if (extractedData.currentTitle) {
      updateData.currentTitle = extractedData.currentTitle;
    }

    if (extractedData.currentCompany) {
      updateData.currentCompany = extractedData.currentCompany;
    }

    if (extractedData.skills && extractedData.skills.length > 0) {
      // Merge with existing skills, remove duplicates
      const existingSkills = (candidate as any).skills || [];
      const mergedSkills = Array.from(
        new Set([...existingSkills, ...extractedData.skills])
      );
      updateData.skills = mergedSkills;
    }

    if (extractedData.experienceYears) {
      updateData.experienceYears = extractedData.experienceYears;
    }

    if (extractedData.industries && extractedData.industries.length > 0) {
      // Merge with existing industries, remove duplicates
      const existingIndustries = (candidate as any).industries || [];
      const mergedIndustries = Array.from(
        new Set([...existingIndustries, ...extractedData.industries])
      );
      updateData.industries = mergedIndustries;
    }

    if (extractedData.summary) {
      // Update AI summary if not already present
      if (!(candidate as any).aiSummary) {
        updateData.aiSummary = extractedData.summary;
      }
    }

    // Update the candidate with extracted data
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
    });

    console.log(`Candidate updated with resume data`);

    return NextResponse.json({
      success: true,
      candidate: updatedCandidate,
      extractedData,
    });
  } catch (error: any) {
    const { error: errMsg, status } = handleAuthError(error);
    console.error("Resume upload error:", error);
    return NextResponse.json(
      { error: errMsg },
      { status }
    );
  }
}

/**
 * GET /api/candidates/[id]/resume (Phase 0 T5): short-lived signed URL for
 * the candidate's resume, for recruiters/admins who may access the candidate.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireCandidateAccess(id);
    const candidate = await prisma.candidate.findUnique({ where: { id }, select: { resumeUrl: true } });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (!candidate.resumeUrl) return NextResponse.json({ error: "No resume on file" }, { status: 404 });
    const url = await signedResumeUrl(candidate.resumeUrl);
    return NextResponse.json({ url, expiresIn: DEFAULT_SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

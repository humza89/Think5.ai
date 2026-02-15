import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCandidateEmbedding } from "@/lib/matching-engine";
import { generateCandidateSummary } from "@/lib/openai";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const recruiterId = searchParams.get("recruiterId");

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (recruiterId) {
      where.recruiterId = recruiterId;
    }

    const candidates = await prisma.candidate.findMany({
      where,
      include: {
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        matches: {
          include: {
            role: {
              include: {
                client: true,
              },
            },
          },
          orderBy: {
            fitScore: "desc",
          },
          take: 5,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(candidates);
  } catch (error) {
    console.error("Error fetching candidates:", error);
    return NextResponse.json(
      { error: "Failed to fetch candidates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      fullName,
      email,
      phone,
      linkedinUrl,
      profileImage,
      currentTitle,
      currentCompany,
      skills,
      experienceYears,
      industries,
      resumeText,
      resumeUrl,
      status,
      recruiterId,
      linkedinProfileData,
      headline,
      location,
    } = body;

    if (!fullName) {
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400 }
      );
    }

    // Create or get recruiter
    let recruiter = await prisma.recruiter.findUnique({
      where: { email: recruiterId || "default@example.com" },
    });

    if (!recruiter) {
      recruiter = await prisma.recruiter.create({
        data: {
          name: "Default Recruiter",
          email: recruiterId || "default@example.com",
        },
      });
    }

    // Generate AI summary
    let aiSummary = "";
    try {
      if (process.env.OPENAI_API_KEY) {
        aiSummary = await generateCandidateSummary({
          fullName,
          currentTitle,
          currentCompany,
          skills: skills || [],
          experienceYears,
          industries: industries || [],
        });
      }
    } catch (error) {
      console.error("Error generating AI summary:", error);
    }

    // Create candidate
    const candidate = await prisma.candidate.create({
      data: {
        fullName,
        email,
        phone,
        linkedinUrl,
        profileImage,
        currentTitle,
        currentCompany,
        skills: linkedinProfileData?.skills || skills || [],
        experienceYears,
        industries: industries || [],
        resumeText,
        resumeUrl,
        status: status || "SOURCED",
        recruiterId: recruiter.id,
        aiSummary,
        headline,
        location,
        experiences: linkedinProfileData?.experiences || null,
        education: linkedinProfileData?.education || null,
      },
    });

    // Generate embedding asynchronously
    if (process.env.OPENAI_API_KEY) {
      generateCandidateEmbedding(candidate.id).catch((error) => {
        console.error("Error generating candidate embedding:", error);
      });
    }

    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    console.error("Error creating candidate:", error);
    return NextResponse.json(
      { error: "Failed to create candidate" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

const prisma = new PrismaClient();

interface LinkedInImportRequest {
  linkedinUrl: string;
  email?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "recruiter") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { linkedinUrl, email } = (await req.json()) as LinkedInImportRequest;

    if (!linkedinUrl) {
      return NextResponse.json({ error: "LinkedIn URL is required" }, { status: 400 });
    }

    // Since we don't have a real proxycurl/scraping API key context loaded in this MVP demo,
    // we'll mock the extraction process for the purpose of moving the system forward.
    // In production, this would be an axios call to Proxycurl or PhantomBuster.
    
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulated data
    const mockExtractedData = {
      firstName: "Jane",
      lastName: "Doe",
      headline: "Senior Project Manager at BuildIt",
      currentTitle: "Senior Project Manager",
      currentCompany: "BuildIt",
      location: "San Francisco, CA",
      skills: ["Project Management", "Agile", "Stakeholder Management", "Construction"],
      yearsExperience: 8,
      rawUrl: linkedinUrl,
    };

    // Create Passive Profile
    const passiveProfile = await prisma.passiveProfile.create({
      data: {
        email: email || undefined,
        linkedinUrl: linkedinUrl,
        firstName: mockExtractedData.firstName,
        lastName: mockExtractedData.lastName,
        currentTitle: mockExtractedData.currentTitle,
        currentCompany: mockExtractedData.currentCompany,
        yearsExperience: mockExtractedData.yearsExperience,
        skills: mockExtractedData.skills,
        source: "linkedin",
        status: "CREATED",
        extractedData: mockExtractedData,
        sourceRecruiterId: profile.id, 
      },
    });

    return NextResponse.json({
      success: true,
      message: "LinkedIn profile imported and passive profile created.",
      data: passiveProfile,
    });
  } catch (error) {
    console.error("LinkedIn Import Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

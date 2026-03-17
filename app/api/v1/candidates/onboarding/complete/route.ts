import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "candidate") {
      return NextResponse.json({ error: "Unauthorized. Must be a candidate." }, { status: 401 });
    }

    const {
      firstName,
      lastName,
      phone,
      location,
      headline,
      summary,
      experienceYears,
    } = await req.json();

    // Upsert Candidate profile
    const candidate = await prisma.candidate.upsert({
      where: {
        id: profile.id, // ID maps to Supabase Auth ID / Profile ID
      },
      update: {
        fullName: `${firstName} ${lastName}`,
        phone,
        location,
        headline,
        aiSummary: summary,
        experienceYears: experienceYears ? parseInt(experienceYears) : undefined,
        onboardingCompleted: true,
        onboardingStep: 4,
      },
      create: {
        id: profile.id,
        recruiterId: "system", // In a real scenario, handle if they were invited manually via a specific recruiter vs organic
        fullName: `${firstName} ${lastName}`,
        email: user.email,
        phone,
        location,
        headline,
        aiSummary: summary,
        experienceYears: experienceYears ? parseInt(experienceYears) : undefined,
        onboardingCompleted: true,
        onboardingStep: 4,
        status: "SOURCED"
      },
    });

    // Mark corresponding passive profile as LINKED if one exists
    if (user.email) {
      await prisma.passiveProfile.updateMany({
        where: { email: user.email },
        data: { 
          status: "LINKED",
          linkedCandidateId: candidate.id 
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding completed successfully.",
      data: candidate,
    });
  } catch (error) {
    console.error("Onboarding Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

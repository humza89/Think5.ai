import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCandidateEmbedding } from "@/lib/matching-engine";
import { generateCandidateSummary } from "@/lib/openai";
import {
  getAuthenticatedUser,
  getRecruiterForUser,
  requireRole,
  handleAuthError,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const where: any = {};

    if (status) {
      where.status = status;
    }

    // Recruiters can only see their own candidates; admins see all
    if (profile?.role === "recruiter") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
      where.recruiterId = recruiter.id;
    }
    // Admins: no recruiterId filter (see all)

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
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
        skip,
        take: limit,
      }),
      prisma.candidate.count({ where }),
    ]);

    return NextResponse.json({
      data: candidates,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching candidates:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);

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
      status: candidateStatus,
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

    // Auto-set recruiter from session — never from request body
    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

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
        status: candidateStatus || "SOURCED",
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
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating candidate:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

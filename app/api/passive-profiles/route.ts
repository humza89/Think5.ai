import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getRecruiterForUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const where: any = { sourceRecruiterId: recruiter.id };
    if (status) where.status = status;

    const [profiles, total] = await Promise.all([
      prisma.passiveProfile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.passiveProfile.count({ where }),
    ]);

    return NextResponse.json({
      data: profiles,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile: userProfile } = await requireRole(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      userProfile.email,
      `${userProfile.first_name} ${userProfile.last_name}`
    );

    const body = await request.json();
    const { email, linkedinUrl, firstName, lastName, source } = body;

    if (!email && !linkedinUrl) {
      return NextResponse.json(
        { error: "Email or LinkedIn URL is required" },
        { status: 400 }
      );
    }

    const passiveProfile = await prisma.passiveProfile.create({
      data: {
        email,
        linkedinUrl,
        firstName,
        lastName,
        source: source || "manual",
        sourceRecruiterId: recruiter.id,
        status: "CREATED",
      },
    });

    return NextResponse.json(passiveProfile, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating passive profile:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

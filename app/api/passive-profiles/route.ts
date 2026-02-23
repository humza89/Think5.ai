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

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const where: any = { sourceRecruiterId: recruiter.id };
    if (status) where.status = status;

    const profiles = await prisma.passiveProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(profiles);
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

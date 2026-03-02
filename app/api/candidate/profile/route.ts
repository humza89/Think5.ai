import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  handleAuthError,
  AuthError,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    // Find candidate records matching this email
    const candidates = await prisma.candidate.findMany({
      where: { email: { equals: profile.email, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      select: {
        fullName: true,
        currentTitle: true,
        currentCompany: true,
        skills: true,
        experienceYears: true,
        industries: true,
        resumeUrl: true,
        linkedinUrl: true,
        location: true,
        headline: true,
        profileImage: true,
        onboardingCompleted: true,
        onboardingStep: true,
      },
    });

    // Aggregate from most recent candidate record
    const latest = candidates[0] || null;

    return NextResponse.json({
      id: user.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      avatarUrl: profile.avatar_url,
      emailVerified: profile.email_verified,
      phone: (profile as Record<string, unknown>).phone || null,
      jobTitle: (profile as Record<string, unknown>).job_title || null,
      bio: (profile as Record<string, unknown>).bio || null,
      // From candidate records (display-only)
      currentTitle: latest?.currentTitle || null,
      currentCompany: latest?.currentCompany || null,
      skills: latest?.skills || [],
      experienceYears: latest?.experienceYears || null,
      industries: latest?.industries || [],
      resumeUrl: latest?.resumeUrl || null,
      linkedinUrl: latest?.linkedinUrl || null,
      location: latest?.location || null,
      headline: latest?.headline || null,
      profileImage: latest?.profileImage || null,
      onboardingCompleted: latest?.onboardingCompleted || false,
      onboardingStep: latest?.onboardingStep || 0,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || profile.role !== "candidate") {
      throw new AuthError("Forbidden: candidates only", 403);
    }

    const body = await req.json();
    const { first_name, last_name, phone, job_title, bio, location, linkedinUrl } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const profileUpdate: Record<string, unknown> = {
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    };
    if (phone !== undefined) profileUpdate.phone = phone;
    if (job_title !== undefined) profileUpdate.job_title = job_title;
    if (bio !== undefined) profileUpdate.bio = bio;

    const { error } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (error) {
      throw new AuthError("Failed to update profile", 500);
    }

    // Also update candidate record if it exists
    const candidate = await prisma.candidate.findFirst({
      where: { email: { equals: profile.email, mode: "insensitive" } },
    });

    if (candidate) {
      const candidateUpdate: Record<string, unknown> = {
        fullName: `${first_name} ${last_name}`.trim(),
      };
      if (location !== undefined) candidateUpdate.location = location;
      if (linkedinUrl !== undefined) candidateUpdate.linkedinUrl = linkedinUrl;
      if (job_title !== undefined) candidateUpdate.currentTitle = job_title;

      await prisma.candidate.update({
        where: { id: candidate.id },
        data: candidateUpdate,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

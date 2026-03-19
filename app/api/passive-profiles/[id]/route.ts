import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedAccess, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;

    const profile = await prisma.passiveProfile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const profile = await prisma.passiveProfile.update({
      where: { id },
      data: {
        ...(body.email !== undefined && { email: body.email }),
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.linkedinUrl !== undefined && { linkedinUrl: body.linkedinUrl }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.currentTitle !== undefined && { currentTitle: body.currentTitle }),
        ...(body.currentCompany !== undefined && { currentCompany: body.currentCompany }),
        ...(body.yearsExperience !== undefined && { yearsExperience: body.yearsExperience ? parseInt(String(body.yearsExperience)) : null }),
        ...(body.skills !== undefined && { skills: body.skills }),
        ...(body.resumeUrl !== undefined && { resumeUrl: body.resumeUrl }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.extractedData !== undefined && { extractedData: body.extractedData }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApprovedAccess(["recruiter", "admin"]);
    const { id } = await params;

    await prisma.passiveProfile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

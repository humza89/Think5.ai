import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["recruiter", "admin"]);
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
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const profile = await prisma.passiveProfile.update({
      where: { id },
      data: {
        ...(body.email !== undefined && { email: body.email }),
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.linkedinUrl !== undefined && { linkedinUrl: body.linkedinUrl }),
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
    await requireRole(["recruiter", "admin"]);
    const { id } = await params;

    await prisma.passiveProfile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

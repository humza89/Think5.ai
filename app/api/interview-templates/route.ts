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

    const templates = await prisma.interviewTemplate.findMany({
      where: {
        OR: [
          { recruiterId: recruiter.id },
          { isDefault: true },
        ],
      },
      include: {
        recruiter: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { interviews: true, invitations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["recruiter", "admin"]);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const body = await request.json();
    const {
      name,
      description,
      roleType,
      durationMinutes,
      questions,
      aiConfig,
      isDefault,
      companyId,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    const template = await prisma.interviewTemplate.create({
      data: {
        name,
        description,
        roleType,
        durationMinutes: durationMinutes || 30,
        questions: questions || [],
        aiConfig: aiConfig || {},
        isDefault: isDefault || false,
        recruiterId: recruiter.id,
        companyId: companyId || null,
      },
      include: {
        recruiter: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating template:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

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

    const where: any = { recruiterId: recruiter.id };
    if (status) where.status = status;

    const invitations = await prisma.interviewInvitation.findMany({
      where,
      include: {
        candidate: { select: { id: true, fullName: true, email: true } },
        job: { select: { id: true, title: true, company: { select: { name: true } } } },
        template: { select: { id: true, name: true } },
        interview: { select: { id: true, status: true, overallScore: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invitations);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

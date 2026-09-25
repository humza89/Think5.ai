import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requireRecruiterRole } from "@/lib/auth";

/** GET/PUT /api/recruiter/profile — the signed-in recruiter's own Recruiter row (Phase 0 T10). */
const EDITABLE = ["name", "phone", "title", "department", "linkedinUrl", "bio"] as const;

export async function GET() {
  try {
    const { recruiter } = await requireRecruiterRole();
    const row = await prisma.recruiter.findUnique({ where: { id: recruiter.id }, select: { id: true, name: true, email: true, phone: true, title: true, department: true, linkedinUrl: true, bio: true, profileImage: true, company: { select: { id: true, name: true } } } });
    return NextResponse.json({ profile: row }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { recruiter } = await requireRecruiterRole();
    const body = await request.json().catch(() => ({}));
    const data: Record<string, string | null> = {};
    for (const field of EDITABLE) {
      if (body[field] === null) data[field] = null;
      else if (typeof body[field] === "string") data[field] = body[field].trim().slice(0, field === "bio" ? 2000 : 200);
    }
    if (typeof data.name === "string" && !data.name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (data.linkedinUrl && !/^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(data.linkedinUrl)) return NextResponse.json({ error: "linkedinUrl must be a linkedin.com URL" }, { status: 400 });
    const updated = await prisma.recruiter.update({ where: { id: recruiter.id }, data, select: { id: true, name: true, email: true, phone: true, title: true, department: true, linkedinUrl: true, bio: true } });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

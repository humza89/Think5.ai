import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INTERVIEW_SESSION_COOKIE, resolveAndAssert } from "@/lib/interview-credential";

const SESSION_MAX_AGE = 7200; // 2 hours, same as /api/interviews/accept

/**
 * POST /api/interviews/[id]/session/refresh (Phase 0 T2)
 *
 * Re-issues the HttpOnly interview-session cookie while an interview is still
 * live, so a candidate in cookie mode is not logged out of the room by the
 * 2-hour cookie TTL. The caller must already hold a valid credential (cookie,
 * header, body or query); nothing new is minted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { accessToken: true, accessTokenExpiresAt: true, status: true },
  });
  if (!interview) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = resolveAndAssert(request, id, interview, body);
  if (!auth.ok) return auth.response;

  const live = ["PENDING", "IN_PROGRESS", "PAUSED", "DISCONNECTED"];
  if (!live.includes(interview.status)) {
    return NextResponse.json({ error: "Interview is not live", status: interview.status }, { status: 409 });
  }

  const res = NextResponse.json({ refreshed: true, source: auth.credential.source, maxAge: SESSION_MAX_AGE });
  res.cookies.set(INTERVIEW_SESSION_COOKIE, `${id}:${auth.credential.token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

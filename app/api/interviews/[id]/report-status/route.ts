import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertInterviewCredential, resolveInterviewCredential } from "@/lib/interview-credential";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const credential = resolveInterviewCredential(request, id, body);

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        accessToken: true,
        accessTokenExpiresAt: true,
        report: { select: { id: true } },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const denied = assertInterviewCredential(interview, credential);
    if (denied) return denied;

    return NextResponse.json({ ready: !!interview.report });
  } catch (error) {
    console.error("Report status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

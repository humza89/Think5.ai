import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 }
      );
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        accessToken: true,
        accessTokenExpiresAt: true,
        report: { select: { id: true } },
      },
    });

    if (!interview || interview.accessToken !== accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check token expiry
    if (
      interview.accessTokenExpiresAt &&
      new Date() > new Date(interview.accessTokenExpiresAt)
    ) {
      return NextResponse.json(
        { error: "Access token has expired" },
        { status: 401 }
      );
    }

    return NextResponse.json({ ready: !!interview.report });
  } catch (error) {
    console.error("Report status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

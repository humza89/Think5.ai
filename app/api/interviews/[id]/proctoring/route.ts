import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken, eventType, severity } = await req.json();

  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.accessToken !== accessToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.proctoringEvent.create({
    data: {
      interviewId: id,
      eventType,
      severity,
    }
  });

  return Response.json({ success: true });
}

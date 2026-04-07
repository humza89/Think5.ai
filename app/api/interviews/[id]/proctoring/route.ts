import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const proctoringEventSchema = z.object({
  accessToken: z.string().min(1),
  eventType: z.enum([
    "TAB_SWITCHED",
    "FULLSCREEN_EXITED",
    "PASTE_DETECTED",
    "COPY_DETECTED",
    "WEBCAM_LOST",
    "STRICT_VIOLATION_TERMINATED",
    "FOCUS_LOST",
    "DEVTOOLS_OPENED",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Rate limit: max 30 proctoring events per minute per interview
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = await checkRateLimit(`proctoring:${id}:${ip}`, { maxRequests: 30, windowMs: 60000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many proctoring events" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = proctoringEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const { accessToken, eventType, severity } = parsed.data;

  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.accessToken !== accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.proctoringEvent.create({
    data: {
      interviewId: id,
      eventType,
      severity,
    }
  });

  return NextResponse.json({ success: true });
}

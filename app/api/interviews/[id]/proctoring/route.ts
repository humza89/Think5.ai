import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { assertInterviewCredential, resolveInterviewCredential } from "@/lib/interview-credential";
import { persistIntegrityBatch } from "@/lib/proctoring-normalizer";

// T3: the room batches client integrity events (hooks/useProctoring.ts).
const clientEventSchema = z.object({
  type: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  timestamp: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "timestamp must be ISO-8601"),
});
const batchSchema = z.object({
  accessToken: z.string().min(1).optional(),
  events: z.array(clientEventSchema).min(1).max(200),
});

const proctoringEventSchema = z.object({
  accessToken: z.string().min(1).optional(),
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

  const isBatch = !!body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events);
  const parsed = isBatch ? batchSchema.safeParse(body) : proctoringEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = assertInterviewCredential(interview, resolveInterviewCredential(req, id, parsed.data));
  if (denied) return denied;

  if (isBatch) {
    const { events } = parsed.data as z.infer<typeof batchSchema>;
    const result = await persistIntegrityBatch(id, events);
    return NextResponse.json({ success: true, ...result });
  }

  const { eventType, severity } = parsed.data as z.infer<typeof proctoringEventSchema>;

  await prisma.proctoringEvent.create({
    data: {
      interviewId: id,
      eventType,
      severity,
    }
  });

  return NextResponse.json({ success: true });
}

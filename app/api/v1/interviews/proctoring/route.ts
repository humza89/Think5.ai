import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProctoringEventSeverity } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

// Valid proctoring event types and their severity mapping
const EVENT_SEVERITY_MAP: Record<string, ProctoringEventSeverity> = {
  tab_switch: "MEDIUM",
  focus_lost: "MEDIUM",
  clipboard_paste: "HIGH",
  copy_detected: "MEDIUM",
  right_click: "MEDIUM",
  devtools_attempt: "HIGH",
  fullscreen_exit: "HIGH",
  keyboard_shortcut: "MEDIUM",
  webcam_disabled: "CRITICAL",
  webcam_lost: "MEDIUM",
  webcam_denied: "CRITICAL",
  face_not_visible: "CRITICAL",
  paste_detected: "HIGH",
};

const VALID_EVENT_TYPES = new Set(Object.keys(EVENT_SEVERITY_MAP));

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "candidate") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { interviewId, type, details } = body;

    if (!interviewId || typeof interviewId !== "string") {
      return NextResponse.json({ error: "Valid interviewId is required" }, { status: 400 });
    }

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "Valid event type is required" }, { status: 400 });
    }

    // Validate event type against known types
    if (!VALID_EVENT_TYPES.has(type)) {
      return NextResponse.json(
        { error: `Invalid event type '${type}'. Valid types: ${Array.from(VALID_EVENT_TYPES).join(", ")}` },
        { status: 400 }
      );
    }

    // Validate details is an object if provided
    if (details !== undefined && details !== null && typeof details !== "object") {
      return NextResponse.json({ error: "Details must be a JSON object" }, { status: 400 });
    }

    // Verify interview exists and belongs to candidate
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { candidateId: true, status: true, consentProctoring: true },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Only log events for active interviews
    if (!["IN_PROGRESS", "PENDING"].includes(interview.status)) {
      return NextResponse.json({ error: "Interview is not active" }, { status: 400 });
    }

    // Respect consent revocation — don't persist if consent withdrawn
    if (!interview.consentProctoring) {
      return NextResponse.json({ ok: true, message: "Proctoring consent not given — event not recorded" });
    }

    const severity = EVENT_SEVERITY_MAP[type];

    const event = await prisma.proctoringEvent.create({
      data: {
        interviewId,
        eventType: type,
        severity,
        details: details || {},
        timestamp: new Date(),
      },
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Proctoring log error:", error);
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}

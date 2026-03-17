import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, ProctoringEventSeverity } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!user || profile?.role !== "candidate") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interviewId, type, details } = await req.json();

    if (!interviewId || !type) {
      return NextResponse.json({ error: "InterviewId and Event Type required" }, { status: 400 });
    }

    // Determine Severity
    let severity: ProctoringEventSeverity = "LOW";
    if (type === "tab_switch") severity = "MEDIUM";
    if (type === "clipboard_paste") severity = "HIGH";
    if (type === "webcam_disabled" || type === "face_not_visible") severity = "CRITICAL";

    // Store Event
    const event = await prisma.proctoringEvent.create({
      data: {
        interviewId,
        eventType: type,
        severity,
        details: details || {},
        timestamp: new Date()
      }
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Proctoring log error:", error);
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateAccess, handleAuthError } from "@/lib/auth";

// GET all notes for a candidate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    await requireCandidateAccess(id);

    const notes = await prisma.note.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(notes);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching notes:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Create a new note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth + ownership check
    const { user } = await requireCandidateAccess(id);

    const body = await request.json();
    const {
      content = "",
      callAnswered,
      voicemailLeft,
      smsSent,
      emailSent,
    } = body;

    // Require at least content OR an activity
    const hasActivity = callAnswered || voicemailLeft || smsSent || emailSent;
    if (!content.trim() && !hasActivity) {
      return NextResponse.json(
        { error: "Note content or at least one activity is required" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        content,
        candidateId: id,
        authorId: user.id, // Always from session, never from body
        isPrivate: true,
        callAnswered,
        voicemailLeft,
        smsSent,
        emailSent,
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating note:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

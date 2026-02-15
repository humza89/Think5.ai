import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all notes for a candidate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const notes = await prisma.note.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(notes);
  } catch (error: any) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

// POST - Create a new note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      content = "",
      authorId = "default-user",
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
        authorId,
        isPrivate: true,
        callAnswered,
        voicemailLeft,
        smsSent,
        emailSent,
      },
    });

    return NextResponse.json(note);
  } catch (error: any) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}

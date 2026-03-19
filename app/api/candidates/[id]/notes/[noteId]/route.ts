import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidateAccess, handleAuthError } from "@/lib/auth";

// PUT - Update a note
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;

    // Verify caller has access to this candidate
    await requireCandidateAccess(id);

    const body = await request.json();
    const { content = "", callAnswered, voicemailLeft, smsSent, emailSent } = body;

    // Require at least content OR an activity
    const hasActivity = callAnswered || voicemailLeft || smsSent || emailSent;
    if (!content.trim() && !hasActivity) {
      return NextResponse.json(
        { error: "Note content or at least one activity is required" },
        { status: 400 }
      );
    }

    const note = await prisma.note.update({
      where: { id: noteId },
      data: {
        content,
        callAnswered,
        voicemailLeft,
        smsSent,
        emailSent,
      },
    });

    return NextResponse.json(note);
  } catch (error: any) {
    const { error: message, status } = handleAuthError(error);
    if (status !== 500) {
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;

    // Verify caller has access to this candidate
    await requireCandidateAccess(id);

    await prisma.note.delete({
      where: { id: noteId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const { error: message, status } = handleAuthError(error);
    if (status !== 500) {
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}

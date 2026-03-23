import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

// GET — List all active legal holds
export async function GET() {
  try {
    await requireRole(["admin"]);

    const [heldInterviews, heldCandidates] = await Promise.all([
      prisma.interview.findMany({
        where: { legalHold: true },
        select: {
          id: true,
          legalHoldReason: true,
          legalHoldSetBy: true,
          legalHoldSetAt: true,
          status: true,
          createdAt: true,
          candidate: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { legalHoldSetAt: "desc" },
      }),
      prisma.candidate.findMany({
        where: { legalHold: true },
        select: {
          id: true,
          fullName: true,
          email: true,
          legalHoldReason: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      interviews: heldInterviews,
      candidates: heldCandidates,
      totals: {
        interviews: heldInterviews.length,
        candidates: heldCandidates.length,
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST — Set legal hold on an interview or candidate
export async function POST(request: NextRequest) {
  try {
    await requireRole(["admin"]);
    const { user } = await getAuthenticatedUser();

    const body = await request.json();
    const { type, id, reason } = body as {
      type: "interview" | "candidate";
      id: string;
      reason: string;
    };

    if (!type || !id || !reason) {
      return NextResponse.json(
        { error: "type, id, and reason are required" },
        { status: 400 }
      );
    }

    if (type === "interview") {
      await prisma.interview.update({
        where: { id },
        data: {
          legalHold: true,
          legalHoldReason: reason,
          legalHoldSetBy: user.id,
          legalHoldSetAt: new Date(),
        },
      });
    } else if (type === "candidate") {
      await prisma.candidate.update({
        where: { id },
        data: {
          legalHold: true,
          legalHoldReason: reason,
        },
      });
    } else {
      return NextResponse.json({ error: "type must be 'interview' or 'candidate'" }, { status: 400 });
    }

    await logActivity({
      action: "legal_hold.set",
      entityType: type,
      entityId: id,
      userId: user.id,
      userRole: "admin",
      metadata: { reason },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE — Release legal hold
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(["admin"]);
    const { user } = await getAuthenticatedUser();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json(
        { error: "type and id query params are required" },
        { status: 400 }
      );
    }

    if (type === "interview") {
      await prisma.interview.update({
        where: { id },
        data: {
          legalHold: false,
          legalHoldReason: null,
          legalHoldSetBy: null,
          legalHoldSetAt: null,
        },
      });
    } else if (type === "candidate") {
      await prisma.candidate.update({
        where: { id },
        data: {
          legalHold: false,
          legalHoldReason: null,
        },
      });
    } else {
      return NextResponse.json({ error: "type must be 'interview' or 'candidate'" }, { status: 400 });
    }

    await logActivity({
      action: "legal_hold.released",
      entityType: type,
      entityId: id,
      userId: user.id,
      userRole: "admin",
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

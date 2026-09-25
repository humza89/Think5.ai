import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleAuthError } from "@/lib/auth";

/**
 * GET/PUT /api/account/notification-preferences (Phase 0 T10) — the existing
 * NotificationPreference row for any signed-in user (candidates keep
 * /api/candidate/settings, which reads the same row).
 */
const FIELDS = ["emailNotifications", "pushNotifications", "interviewInvites", "applicationUpdates", "matchAlerts", "feedbackReady", "systemAlerts"] as const;

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    let preferences = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    if (!preferences) preferences = await prisma.notificationPreference.create({ data: { userId: user.id } });
    return NextResponse.json({ preferences }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const data: Record<string, boolean> = {};
    for (const field of FIELDS) if (typeof body[field] === "boolean") data[field] = body[field];
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No preference fields supplied" }, { status: 400 });
    const preferences = await prisma.notificationPreference.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
    return NextResponse.json({ preferences });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

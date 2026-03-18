import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user } = await requireRole(['candidate']);

    let preferences = await prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preferences) {
      preferences = await prisma.notificationPreference.create({
        data: { userId: user.id },
      });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRole(['candidate']);

    const body = await request.json();
    const {
      emailNotifications,
      pushNotifications,
      interviewInvites,
      applicationUpdates,
      matchAlerts,
      feedbackReady,
      systemAlerts,
    } = body;

    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: {
        emailNotifications,
        pushNotifications,
        interviewInvites,
        applicationUpdates,
        matchAlerts,
        feedbackReady,
        systemAlerts,
      },
      create: {
        userId: user.id,
        emailNotifications,
        pushNotifications,
        interviewInvites,
        applicationUpdates,
        matchAlerts,
        feedbackReady,
        systemAlerts,
      },
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

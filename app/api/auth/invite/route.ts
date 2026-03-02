import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Look up invitation by token
    const invitation = await prisma.interviewInvitation.findUnique({
      where: { token },
      include: {
        job: {
          select: {
            title: true,
            company: { select: { name: true, logoUrl: true } },
          },
        },
        template: {
          select: { name: true, durationMinutes: true },
        },
        recruiter: {
          select: { name: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    // Check expiry
    if (new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    // Check if already used
    if (['COMPLETED', 'DECLINED'].includes(invitation.status)) {
      return NextResponse.json(
        { error: 'This invitation has already been used' },
        { status: 410 }
      );
    }

    // Check for passive profile pre-fill data
    let prefillData = null;
    if (invitation.email) {
      const passiveProfile = await prisma.passiveProfile.findFirst({
        where: { email: invitation.email },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          extractedData: true,
        },
      });
      if (passiveProfile) {
        prefillData = passiveProfile;
      }
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        status: invitation.status,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        jobTitle: invitation.job?.title,
        companyName: invitation.job?.company?.name,
        companyLogo: invitation.job?.company?.logoUrl,
        templateName: invitation.template?.name,
        duration: invitation.template?.durationMinutes,
        recruiterName: invitation.recruiter?.name,
      },
      prefillData,
    });
  } catch (error) {
    console.error('Invite lookup error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

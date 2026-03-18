import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email/resend';
import { checkRateLimit } from '@/lib/rate-limit';

interface InvitedRegisterRequest {
  token: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rateLimitResult = checkRateLimit(`register-invited:${ip}`, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body: InvitedRegisterRequest = await request.json();
    const { token, email, password, firstName, lastName } = body;

    if (!token || !email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Validate invitation token
    const invitation = await prisma.interviewInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    // Create Supabase auth user with email pre-verified
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Pre-verify since they came through invitation
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'candidate',
      },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (existingProfile) {
      await supabase
        .from('profiles')
        .update({
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          role: 'candidate',
          email_verified: true,
        })
        .eq('id', authData.user.id);
    } else {
      await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          role: 'candidate',
          avatar_url: null,
          email_verified: true,
        });
    }

    // Link PassiveProfile if exists
    const passiveProfile = await prisma.passiveProfile.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (passiveProfile) {
      await prisma.passiveProfile.update({
        where: { id: passiveProfile.id },
        data: {
          status: 'LINKED',
          linkedCandidateId: authData.user.id,
        },
      });
    }

    // Update invitation status
    await prisma.interviewInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Set invitationSource and onboardingStatus on candidate record
    const candidate = await prisma.candidate.findFirst({
      where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    });
    if (candidate) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          invitationSource: 'recruiter_invited',
          onboardingStatus: 'INVITED',
        },
      });
    }

    // Send welcome email
    try {
      await sendWelcomeEmail(email, firstName, 'candidate');
    } catch (emailError) {
      console.error('Welcome email error:', emailError);
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now sign in.',
      userId: authData.user.id,
    });
  } catch (error) {
    console.error('Invited registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

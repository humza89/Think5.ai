import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendVerificationEmail } from '@/lib/email/resend';
import crypto from 'crypto';
import type { UserRole } from '@/types/supabase';

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequest = await request.json();
    const { email, password, firstName, lastName, role } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Validate role - only candidate and recruiter can self-register
    // Admin and hiring_manager accounts must be created by admins
    const selfRegisterRoles: UserRole[] = ['candidate', 'recruiter'];
    if (!selfRegisterRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role for self-registration' },
        { status: 403 }
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: false,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role,
      },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token in database
    const { error: tokenError } = await supabase
      .from('verification_tokens')
      .insert({
        user_id: authData.user.id,
        token: verificationToken,
        expires_at: tokenExpiry.toISOString(),
      });

    if (tokenError) {
      console.error('Token storage error:', tokenError);
      // Continue anyway - user can request new verification email
    }

    // Create profile (upsert to handle race with on_auth_user_created trigger)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: email.toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        role,
        avatar_url: null,
        email_verified: false,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken, firstName);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Don't fail registration if email fails - user can request new one
    }

    return NextResponse.json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      userId: authData.user.id,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

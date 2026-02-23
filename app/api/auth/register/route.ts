import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendVerificationEmail } from '@/lib/email/resend';
import crypto from 'crypto';
import type { UserRole } from '@/types/supabase';
import { checkRateLimit } from '@/lib/rate-limit';

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rateLimitResult = checkRateLimit(`register:${ip}`, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

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
      .maybeSingle();

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

    // Ensure profile exists with correct data
    // The on_auth_user_created trigger fires during createUser() and auto-creates
    // the profile. We verify it exists and update, or insert as fallback.
    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (selectError) {
      console.error('Profile select error:', selectError);
    }

    let profileError: unknown = null;

    if (existingProfile) {
      // Normal path: trigger created the profile — update with canonical values
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          role,
          avatar_url: null,
          email_verified: false,
        })
        .eq('id', authData.user.id);
      profileError = updateError;
      if (updateError) console.error('Profile update failed:', updateError);
    } else {
      // Fallback: trigger didn't fire — insert manually
      console.log('Profile not found after createUser, inserting manually for:', authData.user.id);
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          role,
          avatar_url: null,
          email_verified: false,
        });
      profileError = insertError;
      if (insertError) console.error('Profile insert failed:', insertError);
    }

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      const errDetail = profileError && typeof profileError === 'object' && 'message' in profileError
        ? (profileError as { message: string }).message
        : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to create user profile: ${errDetail}` },
        { status: 500 }
      );
    }

    // Store verification token (profile guaranteed to exist now)
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

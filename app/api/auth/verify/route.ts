import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendWelcomeEmail } from '@/lib/email/resend';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(
        new URL('/auth/verify?error=missing_token', request.url)
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Find verification token
    const { data: tokenData, error: tokenError } = await supabase
      .from('verification_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.redirect(
        new URL('/auth/verify?error=invalid_token', request.url)
      );
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      // Delete expired token
      await supabase
        .from('verification_tokens')
        .delete()
        .eq('token', token);

      return NextResponse.redirect(
        new URL('/auth/verify?error=expired_token', request.url)
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', tokenData.user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.redirect(
        new URL('/auth/verify?error=user_not_found', request.url)
      );
    }

    // Update user email verification status
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { email_confirm: true }
    );

    if (updateAuthError) {
      console.error('Error updating auth user:', updateAuthError);
    }

    // Update profile email_verified status
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({ email_verified: true })
      .eq('id', tokenData.user_id);

    if (updateProfileError) {
      console.error('Error updating profile:', updateProfileError);
    }

    // Delete used token
    await supabase
      .from('verification_tokens')
      .delete()
      .eq('token', token);

    // Send welcome email
    try {
      await sendWelcomeEmail(profile.email, profile.first_name, profile.role);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    return NextResponse.redirect(
      new URL('/auth/verify?success=true', request.url)
    );
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.redirect(
      new URL('/auth/verify?error=server_error', request.url)
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseAdminClient();

    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, email_verified')
      .eq('email', email.toLowerCase())
      .single();

    if (profileError || !profile) {
      // Don't reveal if user exists
      return NextResponse.json({
        success: true,
        message: 'If an account exists, a verification email has been sent.',
      });
    }

    if (profile.email_verified) {
      return NextResponse.json({
        success: true,
        message: 'Email is already verified.',
      });
    }

    // Delete any existing tokens for this user
    await supabase
      .from('verification_tokens')
      .delete()
      .eq('user_id', profile.id);

    // Generate new verification token
    const crypto = await import('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store new token
    const { error: tokenError } = await supabase
      .from('verification_tokens')
      .insert({
        user_id: profile.id,
        token: verificationToken,
        expires_at: tokenExpiry.toISOString(),
      });

    if (tokenError) {
      console.error('Token creation error:', tokenError);
      return NextResponse.json(
        { error: 'Failed to create verification token' },
        { status: 500 }
      );
    }

    // Send verification email
    const { sendVerificationEmail } = await import('@/lib/email/resend');
    await sendVerificationEmail(email, verificationToken, profile.first_name);

    return NextResponse.json({
      success: true,
      message: 'Verification email sent.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

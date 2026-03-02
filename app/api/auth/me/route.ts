import { NextResponse } from 'next/server';
import { getAuthenticatedUser, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: profile?.role,
      firstName: profile?.first_name,
      lastName: profile?.last_name,
      avatarUrl: profile?.avatar_url,
      emailVerified: profile?.email_verified,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

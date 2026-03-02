import { NextRequest, NextResponse } from 'next/server';
import { requireRole, handleAuthError } from '@/lib/auth';
import { sendEmail } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin']);

    const body = await request.json();
    const { email, role, name } = body;

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Email and name are required' },
        { status: 400 }
      );
    }

    const validRoles = ['recruiter', 'hiring_manager', 'admin'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/signup`;

    await sendEmail({
      to: email,
      subject: 'You\'ve been invited to join Think5',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #111111; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                    <tr>
                      <td style="padding: 48px 40px;">
                        <div style="text-align: center; margin-bottom: 32px;">
                          <span style="font-size: 28px; font-weight: bold; color: #ffffff;">Think5</span>
                          <span style="font-size: 28px; font-weight: bold; color: #3B82F6;">.</span>
                        </div>
                        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                          You're invited to Think5
                        </h1>
                        <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                          Hi ${name},<br><br>
                          You've been invited to join Think5 as a ${(role || 'recruiter').replace('_', ' ')}. Click the button below to create your account.
                        </p>
                        <div style="text-align: center; margin-bottom: 32px;">
                          <a href="${signupUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                            Create Account
                          </a>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

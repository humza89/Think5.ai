import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail({ to, subject, html, from }: SendEmailOptions) {
  const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'Think5 <noreply@think5.ai>';

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

export async function sendVerificationEmail(email: string, token: string, firstName: string) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #111111; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                <tr>
                  <td style="padding: 48px 40px;">
                    <!-- Logo -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <span style="font-size: 28px; font-weight: bold; color: #ffffff;">think5</span>
                      <span style="font-size: 28px; font-weight: bold; color: #3B82F6;">.</span>
                    </div>

                    <!-- Content -->
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                      Verify your email address
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                      Hi ${firstName},<br><br>
                      Welcome to Think5! Please verify your email address to complete your registration and get started.
                    </p>

                    <!-- Button -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <a href="${verifyUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                        Verify Email Address
                      </a>
                    </div>

                    <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 20px; text-align: center; margin: 0 0 24px 0;">
                      This link will expire in 24 hours. If you didn't create an account with Think5, you can safely ignore this email.
                    </p>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; margin: 0;">
                      If the button doesn't work, copy and paste this link:<br>
                      <a href="${verifyUrl}" style="color: #3B82F6; text-decoration: none; word-break: break-all;">${verifyUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Footer text -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
                &copy; ${new Date().getFullYear()} Think5.ai. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your Think5 account',
    html,
  });
}

export async function sendWelcomeEmail(email: string, firstName: string, role: string) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  const roleMessages: Record<string, string> = {
    candidate: 'You can now browse opportunities and submit applications.',
    recruiter: 'You can now create job postings and manage candidates.',
    hiring_manager: 'You can now review candidates and make hiring decisions.',
    admin: 'You have full access to the platform administration.',
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Think5</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #111111; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                <tr>
                  <td style="padding: 48px 40px;">
                    <!-- Logo -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <span style="font-size: 28px; font-weight: bold; color: #ffffff;">think5</span>
                      <span style="font-size: 28px; font-weight: bold; color: #3B82F6;">.</span>
                    </div>

                    <!-- Content -->
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                      Welcome to Think5, ${firstName}!
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                      Your email has been verified and your account is ready to use.
                    </p>

                    <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="color: #3B82F6; font-size: 14px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase;">
                        Your Role: ${role.replace('_', ' ')}
                      </p>
                      <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0;">
                        ${roleMessages[role] || 'Welcome to the platform!'}
                      </p>
                    </div>

                    <!-- Button -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <a href="${dashboardUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                        Go to Dashboard
                      </a>
                    </div>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.5); font-size: 14px; text-align: center; margin: 0;">
                      Need help getting started? Visit our <a href="${process.env.NEXT_PUBLIC_APP_URL}/docs" style="color: #3B82F6; text-decoration: none;">documentation</a> or <a href="${process.env.NEXT_PUBLIC_APP_URL}/support" style="color: #3B82F6; text-decoration: none;">contact support</a>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Footer text -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
                &copy; ${new Date().getFullYear()} Think5.ai. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to Think5!',
    html,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset your password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #111111; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                <tr>
                  <td style="padding: 48px 40px;">
                    <!-- Logo -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <span style="font-size: 28px; font-weight: bold; color: #ffffff;">think5</span>
                      <span style="font-size: 28px; font-weight: bold; color: #3B82F6;">.</span>
                    </div>

                    <!-- Content -->
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                      Reset your password
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                      We received a request to reset your password. Click the button below to create a new password.
                    </p>

                    <!-- Button -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <a href="${resetUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                        Reset Password
                      </a>
                    </div>

                    <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 20px; text-align: center; margin: 0 0 24px 0;">
                      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
                    </p>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; margin: 0;">
                      If the button doesn't work, copy and paste this link:<br>
                      <a href="${resetUrl}" style="color: #3B82F6; text-decoration: none; word-break: break-all;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Footer text -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
                &copy; ${new Date().getFullYear()} Think5.ai. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your Think5 password',
    html,
  });
}

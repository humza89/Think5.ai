import { sendEmail } from "./resend";

export async function sendCandidateFeedbackEmail({
  candidateEmail,
  candidateName,
  strengths,
}: {
  candidateEmail: string;
  candidateName: string;
  strengths: string[];
}) {
  const strengthsList = strengths
    .slice(0, 5)
    .map(
      (s) =>
        `<li style="color: rgba(255,255,255,0.7); font-size: 14px; line-height: 22px; margin-bottom: 4px;">${s}</li>`
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Interview Complete</title>
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
                      <span style="font-size: 28px; font-weight: bold; color: #ffffff;">Think5</span>
                      <span style="font-size: 28px; font-weight: bold; color: #3B82F6;">.</span>
                    </div>

                    <!-- Content -->
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                      Thank You, ${candidateName}!
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                      Thank you for completing your interview with Aria. Your assessment has been processed and shared with your recruiter.
                    </p>

                    <!-- Strengths -->
                    ${
                      strengthsList
                        ? `<div style="background-color: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="color: #22c55e; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">
                        Key Strengths Identified
                      </p>
                      <ul style="margin: 0; padding-left: 20px;">
                        ${strengthsList}
                      </ul>
                    </div>`
                        : ""
                    }

                    <div style="background-color: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">
                        What happens next?
                      </p>
                      <p style="color: rgba(255,255,255,0.6); font-size: 14px; line-height: 22px; margin: 0;">
                        Your recruiter will review your detailed assessment shortly and may follow up with next steps. If you have any questions about the process, feel free to reach out to your recruiter directly.
                      </p>
                    </div>

                    <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 20px; text-align: center; margin: 0 0 24px 0;">
                      We appreciate your time and wish you the best in your career journey.
                    </p>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; margin: 0;">
                      This email was sent by Aria AI. Scores, detailed ratings, and hiring recommendations are shared only with your recruiter.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Footer text -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
                &copy; ${new Date().getFullYear()} Think5 — Powered by Aria AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: candidateEmail,
    subject: "Your Think5 Interview Assessment is Complete",
    html,
  });
}

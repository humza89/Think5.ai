import { sendEmail } from "./resend";

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  TECHNICAL: "Technical Assessment",
  BEHAVIORAL: "Behavioral Interview",
  DOMAIN_EXPERT: "Domain Expert Evaluation",
  LANGUAGE: "Language Proficiency",
  CASE_STUDY: "Case Study Analysis",
};

export async function sendInterviewInvitation({
  candidateEmail,
  candidateName,
  interviewType,
  interviewUrl,
  recruiterName,
}: {
  candidateEmail: string;
  candidateName: string;
  interviewType: string;
  interviewUrl: string;
  recruiterName: string;
}) {
  const typeLabel = INTERVIEW_TYPE_LABELS[interviewType] || "AI Interview";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Think5 AI Interview Invitation</title>
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
                      AI Interview Invitation
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                      Hi ${candidateName},<br><br>
                      ${recruiterName} has invited you to complete an AI-powered interview with Aria, our intelligent interviewer.
                    </p>

                    <!-- Interview Details -->
                    <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="color: #3B82F6; font-size: 14px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase;">
                        Interview Details
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Type:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right;">${typeLabel}</td>
                        </tr>
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Duration:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right;">~30 minutes</td>
                        </tr>
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Format:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right;">Text-based conversation with AI</td>
                        </tr>
                      </table>
                    </div>

                    <!-- Instructions -->
                    <div style="background-color: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">
                        Before you begin:
                      </p>
                      <ul style="color: rgba(255,255,255,0.6); font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
                        <li>Find a quiet environment with stable internet</li>
                        <li>Have your webcam ready (used for identity verification)</li>
                        <li>The interview is adaptive — take your time with each answer</li>
                        <li>You can complete the interview at any time, 24/7</li>
                      </ul>
                    </div>

                    <!-- Button -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <a href="${interviewUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                        Start Interview
                      </a>
                    </div>

                    <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 20px; text-align: center; margin: 0 0 24px 0;">
                      This link is unique to you. Please do not share it with anyone.
                    </p>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; margin: 0;">
                      If the button doesn't work, copy and paste this link:<br>
                      <a href="${interviewUrl}" style="color: #3B82F6; text-decoration: none; word-break: break-all;">${interviewUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Footer text -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
                &copy; ${new Date().getFullYear()} Think5.ai — Powered by Aria AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: candidateEmail,
    subject: `Think5 AI Interview — ${typeLabel}`,
    html,
  });
}

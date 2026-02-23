import { sendEmail } from "./resend";

const RECOMMENDATION_LABELS: Record<string, string> = {
  STRONG_YES: "Strong Yes",
  YES: "Yes",
  MAYBE: "Maybe",
  NO: "No",
  STRONG_NO: "Strong No",
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  STRONG_YES: "#22c55e",
  YES: "#4ade80",
  MAYBE: "#f59e0b",
  NO: "#f87171",
  STRONG_NO: "#ef4444",
};

export async function sendReportReadyEmail({
  recruiterEmail,
  recruiterName,
  candidateName,
  interviewType,
  overallScore,
  recommendation,
  reportUrl,
}: {
  recruiterEmail: string;
  recruiterName: string;
  candidateName: string;
  interviewType: string;
  overallScore: number | null;
  recommendation: string | null;
  reportUrl: string;
}) {
  const typeLabel = interviewType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const recLabel = recommendation
    ? RECOMMENDATION_LABELS[recommendation] || recommendation
    : "Pending";
  const recColor = recommendation
    ? RECOMMENDATION_COLORS[recommendation] || "#a3a3a3"
    : "#a3a3a3";

  const scoreDisplay =
    overallScore !== null ? `${Math.round(overallScore)}/100` : "N/A";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Interview Report Ready</title>
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
                      Interview Report Ready
                    </h1>

                    <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                      Hi ${recruiterName},<br><br>
                      The AI interview assessment for <strong style="color: #ffffff;">${candidateName}</strong> is now available.
                    </p>

                    <!-- Report Summary -->
                    <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Candidate:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right;">${candidateName}</td>
                        </tr>
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Interview Type:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right;">${typeLabel}</td>
                        </tr>
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Overall Score:</td>
                          <td style="color: rgba(255,255,255,0.9); font-size: 14px; padding: 4px 0; text-align: right; font-weight: 600;">${scoreDisplay}</td>
                        </tr>
                        <tr>
                          <td style="color: rgba(255,255,255,0.5); font-size: 14px; padding: 4px 0;">Recommendation:</td>
                          <td style="font-size: 14px; padding: 4px 0; text-align: right;">
                            <span style="display: inline-block; background-color: ${recColor}20; color: ${recColor}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 13px;">${recLabel}</span>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Button -->
                    <div style="text-align: center; margin-bottom: 32px;">
                      <a href="${reportUrl}" style="display: inline-block; background-color: #ffffff; color: #000000; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px;">
                        View Full Report
                      </a>
                    </div>

                    <!-- Divider -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;"></div>

                    <!-- Footer -->
                    <p style="color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; margin: 0;">
                      This report was generated by Aria AI. Review the full assessment for detailed skill ratings, transcript analysis, and hiring recommendations.
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
    to: recruiterEmail,
    subject: `Interview Report: ${candidateName} — ${recLabel}`,
    html,
  });
}
